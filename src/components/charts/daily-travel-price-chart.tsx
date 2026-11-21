"use client";

import { useRef, useState } from "react";
import { addDays, format, parseISO, subDays } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import type { RecommendationItem, RecommendationResponse } from "@/types/travel";
import styles from "./destination-overview.module.css";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const COLORS = { stay: "#1e70ad", food: "#d88d13" };
// Golden-angle spacing keeps activity colors distinct even on longer trips.
function activityColor(index: number) {
  return `hsl(${(index * 137.508 + 270) % 360} 68% 35%)`;
}
const PLOTS = [
  { id: "stacked", label: "Stacked bars" },
  { id: "treemap", label: "Treemap" },
  { id: "lollipop", label: "Lollipop" },
] as const;
type Plot = typeof PLOTS[number]["id"];
type Segment = { id: string; name: string; category: string; amount: number; color: string; kind: "stay" | "activity" | "food"; timeRange?: string };
type Row = { date: string; day: number; segments: Segment[]; total: number };

function eventTimeRange(activity: RecommendationItem) {
  if (activity.type !== "event") return undefined;
  const start = activity.sourceRow.start_time_local?.match(/^(\d{1,2}):(\d{2})/);
  const end = activity.sourceRow.end_time_local?.match(/^(\d{1,2}):(\d{2})/);
  if (!start || !end) return undefined;
  const format = (parts: RegExpMatchArray) => {
    const hour = Number(parts[1]);
    const minute = Number(parts[2]);
    if (hour > 23 || minute > 59) return undefined;
    return `${hour % 12 || 12}:${parts[2]} ${hour < 12 ? "AM" : "PM"}`;
  };
  const opening = format(start);
  const closing = format(end);
  return opening && closing && opening !== closing ? `${opening}–${closing}` : undefined;
}

function activityCategory(activity: RecommendationItem) {
  const row = activity.sourceRow;
  if (activity.type === "event") return row.genre || row.segment || "Events";
  if (activity.type === "heritage") return row.heritage_category || "Heritage";
  const labels = row.fsq_category_labels;
  if (!labels) return "Activities";
  let firstLabel = labels;
  try {
    const parsed: unknown = JSON.parse(labels);
    if (Array.isArray(parsed) && typeof parsed[0] === "string") {
      firstLabel = parsed[0];
    }
  } catch {
    firstLabel = labels.split(/[,;|]/)[0];
  }
  return firstLabel.split(">")[0].replace(/^[\s\["']+|[\s\]"']+$/g, "").trim() || "Activities";
}

const ALIASES: Record<string, string> = {
  "Mauerflimmern Open-Air-Kino": "Mauerflimmern",
  "Schübel & Hofmann Gesunde Schuhe": "Schübel & Hofmann",
  "BROOKLYN Fashion GmbH": "BROOKLYN Fashion",
  "Richard Riedel GmbH MBT-Service-Center Schuh Hofmann": "Richard Riede",
};
function shortName(name: string) {
  const normalized = name.trim().replace(/\s+/g, " ");
  if (ALIASES[normalized]) return ALIASES[normalized];
  if (normalized.length <= 26) return normalized;
  let result = normalized.split(" ")[0];
  for (const word of normalized.split(" ").slice(1)) {
    if (`${result} ${word}`.length > 26) break;
    result += ` ${word}`;
  }
  return result;
}
function DayLabel({ row }: { row: Row }) {
  return <span className={styles.locationLabel}><strong>Day {row.day}</strong><small>{row.date}</small></span>;
}
function Stacked({ rows, onSelectDay }: { rows: Row[]; onSelectDay: (row: Row) => void }) {
  const widths = rows.map(row => row.segments.map(segment =>
    Math.max(104, Math.round(segment.amount / Math.max(1, row.total) * 650))));
  const chartWidth = Math.max(980, ...widths.map(items => items.reduce((sum, width) => sum + width, 260)));
  return <div className={styles.dailyScroll}><div style={{ minWidth: chartWidth }}>
    {rows.map((row, rowIndex) => <article className={styles.dailyDay} key={row.date}>
      <div className={styles.dailyChartRow}>
        <DayLabel row={row} />
        <span className={styles.barTrack}><button type="button" className={styles.stackButton}
          aria-label={`View Day ${row.day} cost details for ${row.date}`}
          onClick={() => onSelectDay(row)}><span className={styles.barStack}
          style={{ width: widths[rowIndex].reduce((sum, width) => sum + width, 0) }}>
          {row.segments.map((segment, index) => <span
            className={`${styles.barSegment} ${styles.dailyBarSegment}`}
            key={`${segment.name}-${index}`}
            style={{ width: widths[rowIndex][index], backgroundColor: segment.color }}
            title={`${segment.name}: ${money.format(segment.amount)}${segment.timeRange ? ` · ${segment.timeRange}` : ""}`}>
            <span>{shortName(segment.name)}</span>
            {segment.timeRange && <small className={styles.eventTimeRange}>{segment.timeRange}</small>}
            <strong>{money.format(segment.amount)}</strong>
          </span>)}
        </span></button></span>
        <strong className={styles.totalLabel}>{money.format(row.total)}</strong>
      </div>
    </article>)}
  </div></div>;
}
function Treemap({ rows }: { rows: Row[] }) {
  const widths = rows.map(row => row.segments.map(segment =>
    Math.max(104, Math.round(segment.amount / Math.max(1, row.total) * 650))));
  const chartWidth = Math.max(980, ...widths.map(items => items.reduce((sum, width) => sum + width, 260)));
  return <div className={styles.dailyScroll}><div style={{ minWidth: chartWidth }}>
    {rows.map((row, rowIndex) => <article className={styles.dailyDay} key={row.date}>
      <div className={styles.dailyChartRow}>
        <DayLabel row={row} />
        <span className={styles.barTrack}><span className={styles.treemapTiles}
          style={{ width: widths[rowIndex].reduce((sum, width) => sum + width, 0) }}>
          {row.segments.map((segment, index) => <span
            className={styles.treemapTile} key={`${segment.name}-${index}`}
            style={{ width: widths[rowIndex][index], backgroundColor: segment.color }}
            title={`${segment.name}: ${money.format(segment.amount)}`}>
            <span>{shortName(segment.name)}</span><strong>{money.format(segment.amount)}</strong>
          </span>)}
        </span></span>
        <strong className={styles.totalLabel}>{money.format(row.total)}</strong>
      </div>
    </article>)}
  </div></div>;
}
function Lollipop({ rows }: { rows: Row[] }) {
  const maximum = Math.max(1, ...rows.flatMap(row => row.segments.map(segment => segment.amount)));
  return <div className={styles.dailyScroll}>{rows.map(row => <article className={styles.lollipopDay} key={row.date}>
    <header><DayLabel row={row} /><strong>{money.format(row.total)}</strong></header>
    {row.segments.map((segment, index) => <div className={styles.lollipopRow} key={`${segment.name}-${index}`}>
      <span title={segment.name}>{segment.name}</span>
      <div className={styles.lollipopTrack} title={`${segment.name}: ${money.format(segment.amount)}`}>
        <div style={{ width: `${segment.amount / maximum * 100}%`, backgroundColor: segment.color }}>
          <i style={{ backgroundColor: segment.color }} />
        </div>
      </div>
      <strong>{money.format(segment.amount)}</strong>
    </div>)}
  </article>)}<p className={styles.plotCaption}>Each dot uses the same price scale across all displayed days.</p></div>;
}

export function DailyTravelPriceChart({ recommendations, accommodationId, selectedRank, onSelectedRankChange,
  travelStart, travelEnd, onTravelDatesChange, datesLoading, datesError }: {
  recommendations: RecommendationResponse; accommodationId?: string;
  selectedRank?: number; onSelectedRankChange?: (rank: number) => void;
  travelStart?: string; travelEnd?: string;
  onTravelDatesChange?: (start: string, end: string) => void;
  datesLoading?: boolean; datesError?: string;
}) {
  const [localRank, setLocalRank] = useState(1);
  const [plot, setPlot] = useState<Plot>("stacked");
  const [selectedDay, setSelectedDay] = useState<{ tripId: string; dayIndex: number } | null>(null);
  const [edits, setEdits] = useState<Record<string, { amount?: number; removed?: boolean }>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState("");
  const [draftDates, setDraftDates] = useState<{ start: string; end: string } | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const detailed = Boolean(accommodationId);
  const trip = accommodationId
    ? recommendations.top10.find(item => item.accommodation.id === accommodationId) ?? recommendations.top10[0]
    : recommendations.top10.find(item => item.rank === (selectedRank ?? localRank)) ?? recommendations.top10[0];
  if (!trip || trip.days.length === 0) return <section className={styles.chartPanel}>
    <h2>Daily price comparison</h2><p>No daily cost estimate is available for this recommendation.</p>
  </section>;

  const limited = !detailed && trip.days.length > 25;
  const days = trip.days;
  const perDayStay = trip.accommodationCost / trip.days.length;
  const activityColors = new Map(
    [...new Set(days.flatMap(day => day.activities.map(activityCategory)))].map(
      (name, index) => [name, name === "Food & drink" ? COLORS.food : activityColor(index)]
    )
  );
  const rows: Row[] = days.map((day, index) => {
    const activities: Segment[] = day.activities.flatMap((activity, activityIndex) => {
      const price = day.activityCosts[activityIndex];
      const category = activityCategory(activity);
      const id = JSON.stringify([trip.accommodation.id, day.date, "activity", activityIndex]);
      return price == null ? [] : [{
        id, name: activity.name, category, amount: edits[id]?.amount ?? price,
        color: activityColors.get(category) ?? activityColor(0),
        timeRange: eventTimeRange(activity),
        kind: "activity" as const,
      }];
    });
    const segments: Segment[] = [
      { id: JSON.stringify([trip.accommodation.id, day.date, "stay"]), name: trip.accommodation.name,
        category: "Accommodation", amount: perDayStay, color: COLORS.stay, kind: "stay" as const },
      ...activities,
      { id: JSON.stringify([trip.accommodation.id, day.date, "food"]),
        name: day.foodVenue?.name ?? "Food allowance estimate", category: "Food & drink", amount: day.foodCost,
        color: COLORS.food, kind: "food" as const },
    ].filter(segment => !edits[segment.id]?.removed && Number.isFinite(segment.amount)
      && (segment.amount > 0 || edits[segment.id]?.amount === 0))
      .map(segment => ({ ...segment, amount: edits[segment.id]?.amount ?? segment.amount }));
    return { date: day.date, day: index + 1, segments,
      total: segments.reduce((sum, segment) => sum + segment.amount, 0) };
  });
  const displayedRows = limited ? rows.slice(0, 20) : rows;
  const legend = [...new Map(
    displayedRows.flatMap(row => row.segments.map(segment => [
      segment.category, segment,
    ] as const))
  ).values()];
  const allDaysCost = rows.reduce((sum, row) => sum + row.total, 0);
  const budgetPercentage = trip.budget > 0 ? allDaysCost / trip.budget * 100 : null;
  const selectedDayRow = selectedDay?.tripId === trip.accommodation.id ? rows[selectedDay.dayIndex] : null;
  const selectedDayCategories = new Map<string, string>();
  for (const segment of selectedDayRow?.segments ?? []) {
    selectedDayCategories.set(segment.category, segment.color);
  }
  const dateStart = draftDates?.start ?? travelStart ?? "";
  const dateEnd = draftDates?.end ?? travelEnd ?? "";
  const selectedDates = dateStart
    ? { from: parseISO(dateStart), to: dateEnd && dateStart < dateEnd ? subDays(parseISO(dateEnd), 1) : undefined }
    : undefined;

  function openDay(row: Row) {
    setSelectedDay({ tripId: trip.accommodation.id, dayIndex: row.day - 1 });
    dialogRef.current?.showModal();
  }

  function savePrice(id: string) {
    if (selectedDayRow?.segments.find(segment => segment.id === id)?.kind === "stay") return;
    const amount = Number(priceDraft);
    if (!priceDraft.trim() || !Number.isFinite(amount) || amount < 0) return;
    setEdits(current => ({ ...current, [id]: { ...current[id], amount: Math.round(amount * 100) / 100 } }));
    setEditingId(null);
  }

  function removeSegment(id: string) {
    if (selectedDayRow?.segments.find(segment => segment.id === id)?.kind === "stay") return;
    setEdits(current => ({ ...current, [id]: { ...current[id], removed: true } }));
    setEditingId(null);
  }

  return <section className={styles.chartPanel} aria-labelledby="daily-travel-price-title">
    <div className={styles.chartHeader}><div>
      <h2 id="daily-travel-price-title">{detailed ? "Detailed daily price comparison" : "Daily Travel Price Comparison"}</h2>
      <p>{detailed
        ? `Daily estimates for all ${trip.days.length} days at ${trip.accommodation.name}: stay, priced activities, and food.`
        : "Explore daily costs from several views. Each uses the same estimated prices."}</p>
    </div><div className={styles.chartHeaderRight}>
      <div className={styles.chartBudgetSummary} aria-label="Trip budget summary">
        <div><span>Your budget</span><strong>{money.format(trip.budget)}</strong></div>
        <div><span>All days’ recommended cost</span><strong>{money.format(allDaysCost)}</strong></div>
        <div><span>Cost as % of budget</span><strong>{budgetPercentage === null ? "—" : `${budgetPercentage.toFixed(1)}%`}</strong></div>
      </div>
      <span className={styles.sourceBadge}>Recommendation · #{trip.rank}</span>
    </div></div>
    <div className={styles.chartToolbar}>
      <div className={styles.chartSelectors}>
        {!detailed && <div className={styles.controls}><label htmlFor="daily-price-recommendation">Recommendation
          <select id="daily-price-recommendation" value={trip.rank} onChange={event => {
            const rank = Number(event.target.value);
            if (onSelectedRankChange) onSelectedRankChange(rank);
            else setLocalRank(rank);
          }}>
            {recommendations.top10.map(item => <option key={item.rank} value={item.rank}>
              #{item.rank} · {item.accommodation.name} · {item.accommodation.city}
            </option>)}
          </select>
        </label></div>}
        <div className={styles.plotPicker}>
          <label htmlFor="daily-price-plot">Plot type
            <select id="daily-price-plot" value={plot}
              onChange={event => setPlot(event.target.value as Plot)}>
              {PLOTS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
        </div>
      </div>
      <div className={styles.chartLegend} aria-label="Recommendation categories">
        <strong>Recommendation Categories</strong>
        <ul>
          {legend.map(segment => <li key={segment.category}>
            <span className={styles.legendSwatch} style={{ backgroundColor: segment.color }} aria-hidden="true" />
            <span>{segment.category}</span>
          </li>)}
        </ul>
      </div>
    </div>
    {onTravelDatesChange && travelStart && travelEnd && <div className={styles.travelDateSection}>
      <button type="button" className={styles.travelDateToggle}
        aria-expanded={calendarOpen} onClick={() => setCalendarOpen(open => !open)}>
        Travel dates: {travelStart} – {travelEnd} · Change dates
      </button>
      {calendarOpen && <div className={styles.travelDateEditor}>
        <div className={styles.travelDateFields}>
          <label>Start date<input type="date" value={dateStart}
            onChange={event => setDraftDates({ start: event.target.value, end: dateEnd })} /></label>
          <label>End date (check-out)<input type="date" value={dateEnd} min={dateStart}
            onChange={event => setDraftDates({ start: dateStart, end: event.target.value })} /></label>
        </div>
        <Calendar className={styles.travelCalendar} mode="range" selected={selectedDates}
          defaultMonth={selectedDates?.from}
          modifiers={{ previousTrip: { from: parseISO(travelStart), to: subDays(parseISO(travelEnd), 1) } }}
          modifiersClassNames={{ previousTrip: styles.previousTripDay }}
          onSelect={range => {
            if (range?.from) setDraftDates({ start: format(range.from, "yyyy-MM-dd"),
              end: range.to ? format(addDays(range.to, 1), "yyyy-MM-dd") : "" });
          }} />
        <p>Green shows the dates being selected; pale green keeps your previous trip days visible while editing. Check-out is the day after the last travel day.</p>
        <button type="button" disabled={datesLoading || !dateStart || !dateEnd || dateStart >= dateEnd}
          onClick={() => { onTravelDatesChange(dateStart, dateEnd); setCalendarOpen(false); }}>
          {datesLoading ? "Updating recommendations…" : "Apply travel dates"}
        </button>
      </div>}
      {datesError && <p role="alert" className={styles.travelDateError}>{datesError}</p>}
    </div>}
    <div className={styles.plotBody}>
      {plot === "stacked" && <Stacked rows={displayedRows} onSelectDay={openDay} />}
      {plot === "treemap" && <Treemap rows={displayedRows} />}
      {plot === "lollipop" && <Lollipop rows={displayedRows} />}
    </div>
    <dialog ref={dialogRef} className={styles.dayDialog} onClose={() => setSelectedDay(null)}
      onClick={event => {
        if (event.target === event.currentTarget) dialogRef.current?.close();
      }} aria-labelledby="day-dialog-title">
      {selectedDayRow && <div className={styles.dayDialogContent}>
        <div className={styles.dayDialogHeader}>
          <div><h2 id="day-dialog-title">Day {selectedDayRow.day} cost breakdown</h2>
            <p>{selectedDayRow.date}</p></div>
          <button type="button" className={styles.dayDialogClose} onClick={() => dialogRef.current?.close()}
            aria-label="Close day details">×</button>
        </div>
        <div className={styles.dayDialogChart}>
          <strong>Day {selectedDayRow.day} recommendation categories</strong>
          <ul className={styles.dayDialogCategories} aria-label="Category color key">
            {[...selectedDayCategories].map(([name, color]) => <li key={name}>
              <span className={styles.legendSwatch} style={{ backgroundColor: color }} aria-hidden="true" />
              <span>{name}</span>
            </li>)}
          </ul>
          <div className={styles.dayDialogStackScroll}>
            <div className={styles.dayDialogStack} role="img"
              aria-label={`Day ${selectedDayRow.day} stacked recommendations: ${selectedDayRow.segments.map(segment => `${segment.name} ${money.format(segment.amount)}`).join(", ")}`}>
              {selectedDayRow.segments.map(segment => <span key={segment.id}
                style={{ width: Math.max(140, segment.amount / Math.max(1, selectedDayRow.total) * 900), backgroundColor: segment.color }}
                title={`${segment.name}: ${money.format(segment.amount)}${segment.timeRange ? ` · ${segment.timeRange}` : ""}`}>
                <span>{segment.name}</span>
                {segment.timeRange && <small>{segment.timeRange}</small>}
                <strong>{money.format(segment.amount)}</strong>
              </span>)}
            </div>
          </div>
        </div>
        <ul className={styles.dayDialogList}>
          {selectedDayRow.segments.map(segment => <li key={segment.id}>
            <span className={styles.legendSwatch} style={{ backgroundColor: segment.color }} aria-hidden="true" />
            <div><strong>{segment.name}</strong><small>{segment.category}{segment.timeRange ? ` · ${segment.timeRange}` : ""}</small></div>
            {segment.kind === "stay" ? <b>{money.format(segment.amount)}</b>
              : editingId === segment.id ? <form className={styles.dayDialogEdit} onSubmit={event => {
              event.preventDefault(); savePrice(segment.id);
            }}>
              <label>Price ($)<input type="number" min="0" step="0.01" required value={priceDraft}
                onChange={event => setPriceDraft(event.target.value)} /></label>
              <button type="submit">Save</button>
              <button type="button" onClick={() => setEditingId(null)}>Cancel</button>
            </form> : <div className={styles.dayDialogActions}>
              <b>{money.format(segment.amount)}</b>
              <button type="button" onClick={() => { setEditingId(segment.id); setPriceDraft(String(segment.amount)); }}
                aria-label={`Edit price for ${segment.name}`}>Edit price</button>
              <button type="button" onClick={() => removeSegment(segment.id)}
                aria-label={`Remove ${segment.name} from day ${selectedDayRow.day}`}>Remove</button>
            </div>}
          </li>)}
        </ul>
        <div className={styles.dayDialogTotal}><strong>Daily total</strong><strong>{money.format(selectedDayRow.total)}</strong></div>
      </div>}
    </dialog>
    <p className={styles.chartCaution}>
      Round-trip and local travel are excluded from these daily plots. Activities without a USD price are excluded.
      {limited && ` Showing days 1–20 of ${trip.days.length}; all days remain in the itinerary below.`}
    </p>
  </section>;
}
