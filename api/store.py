"""PostgreSQL-backed CSV ingestion and indexed record access."""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Callable, Iterable

import psycopg
from psycopg.rows import dict_row

from .models import SourceRecord
from .normalize import json_row, to_source_record

Progress = Callable[[int, str], None]


class TravelDataStore:
    """Build and query a PostgreSQL index of all CSV datasets."""

    def __init__(self, database_url: str):
        if not database_url.startswith(("postgresql://", "postgres://")):
            raise ValueError("A PostgreSQL DATABASE_URL is required")
        self.database_url = database_url

    def connection(self) -> psycopg.Connection:
        return psycopg.connect(self.database_url, row_factory=dict_row)

    def initialize(self) -> None:
        with self.connection() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS records (
                    id BIGSERIAL PRIMARY KEY,
                    source TEXT NOT NULL,
                    row_number INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    record_type TEXT NOT NULL,
                    country TEXT NOT NULL,
                    state TEXT NOT NULL,
                    city TEXT NOT NULL,
                    latitude DOUBLE PRECISION,
                    longitude DOUBLE PRECISION,
                    search_text TEXT NOT NULL,
                    source_row TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS sources (
                    source TEXT PRIMARY KEY,
                    row_count BIGINT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_records_country
                    ON records(country);
                CREATE INDEX IF NOT EXISTS idx_records_city
                    ON records(country, city);
                CREATE INDEX IF NOT EXISTS idx_records_type
                    ON records(record_type);
                CREATE INDEX IF NOT EXISTS idx_records_grid
                    ON records(latitude, longitude);
                """
            )

    def rebuild(
        self,
        data_directory: str | Path,
        progress: Progress | None = None,
    ) -> dict[str, int]:
        directory = Path(data_directory)
        files = sorted(directory.glob("*.csv"))
        if not files:
            raise FileNotFoundError(f"No CSV files found in {directory}")

        self.initialize()
        counts: dict[str, int] = {}
        with self.connection() as connection:
            connection.execute("TRUNCATE TABLE records, sources RESTART IDENTITY")
            for index, file in enumerate(files):
                count = self._ingest_file(connection, file)
                counts[file.name] = count
                connection.execute(
                    "INSERT INTO sources(source, row_count) VALUES (%s, %s)",
                    (file.name, count),
                )
                if progress:
                    progress(
                        int((index + 1) / len(files) * 100),
                        f"Indexed {file.name} ({count:,} rows)",
                    )
        return counts

    def _ingest_file(
        self,
        connection: psycopg.Connection,
        file: Path,
    ) -> int:
        count = 0
        insert_sql = """
            INSERT INTO records(
                source, row_number, name, record_type,
                country, state, city, latitude, longitude,
                search_text, source_row
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        batch: list[tuple[object, ...]] = []
        with file.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            for row_number, row in enumerate(reader, start=2):
                clean = {
                    str(key).strip(): str(value or "").strip()
                    for key, value in row.items()
                    if key is not None
                }
                if not any(clean.values()):
                    continue
                record = to_source_record(file.name, row_number, clean)
                batch.append(
                    (
                        record.source,
                        record.row_number,
                        record.name,
                        record.record_type,
                        record.country,
                        record.state,
                        record.city,
                        record.latitude,
                        record.longitude,
                        record.search_text,
                        json_row(record.row),
                    )
                )
                count += 1
                if len(batch) >= 1000:
                    with connection.cursor() as cursor:
                        cursor.executemany(insert_sql, batch)
                    batch.clear()
        if batch:
            with connection.cursor() as cursor:
                cursor.executemany(insert_sql, batch)
        return count

    def all_sources(self) -> list[str]:
        with self.connection() as connection:
            return [
                row["source"]
                for row in connection.execute(
                    "SELECT source FROM sources ORDER BY source"
                )
            ]

    def query(
        self,
        where: str = "",
        parameters: Iterable[object] = (),
        limit: int | None = None,
    ) -> list[SourceRecord]:
        sql = "SELECT * FROM records"
        if where:
            sql += f" WHERE {where}"
        sql += " ORDER BY id"
        if limit is not None:
            sql += f" LIMIT {int(limit)}"

        with self.connection() as connection:
            rows = connection.execute(sql, tuple(parameters)).fetchall()
        return [
            SourceRecord(
                source=row["source"],
                row_number=row["row_number"],
                row=json.loads(row["source_row"]),
                latitude=row["latitude"],
                longitude=row["longitude"],
                name=row["name"],
                country=row["country"],
                state=row["state"],
                city=row["city"],
                record_type=row["record_type"],
                search_text=row["search_text"],
            )
            for row in rows
        ]
