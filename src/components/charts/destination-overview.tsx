
"use client";

import { useState } from "react";

import { MapPin } from "lucide-react";
import { addDays, format, parseISO } from "date-fns";
import { DailyTravelPriceChart } from "./daily-travel-price-chart";
import { RecommendationMap } from "./recommendation-map";
import type {
  RecommendationResponse,
  RecommendationItinerary,
  TravelPlan,
} from "@/types/travel";

import {
  useTravelCountries,
  price,
  usd,
  comparisonSum,
  displayLocation,
  type TravelCountryRecord,
} from "@/hooks/use-travel-countries";

import styles from "./destination-overview.module.css";

type OverviewProps = {
  plan: TravelPlan;
  recommendations?: RecommendationResponse;
  onOpenDestination: (row: TravelCountryRecord) => void;
  onDatesApplied?: (start: string, end: string, result: RecommendationResponse) => void;
};

function trimRecommendation(item: RecommendationItinerary, start: string, end: string): RecommendationItinerary {
  const days = item.days.filter(day => day.date >= start && day.date < end);
  const accommodationCost = item.accommodationCost / Math.max(1, item.days.length) * days.length;
  const activityCost = days.reduce((sum, day) => sum + day.activityCost, 0);
  const foodCost = days.reduce((sum, day) => sum + day.foodCost, 0);
  const localTransportCost = days.reduce((sum, day) => sum + day.localTransportCost, 0);
  const totalCost = accommodationCost + activityCost + foodCost + localTransportCost + item.transportCost;
  return { ...item, days, nights: days.length, accommodationCost, activityCost, foodCost,
    localTransportCost, totalCost, remainingBudget: item.budget - totalCost,
    budgetFitPercentage: item.budget > 0 ? Math.max(0, 100 - Math.abs(totalCost - item.budget) / item.budget * 100) : 0,
    activities: days.flatMap(day => day.activities),
    unpricedActivityCount: days.reduce((sum, day) => sum + day.activityCosts.filter(cost => cost === null).length, 0) };
}

const POSITIONS = [
  { left: 18, top: 24 },
  { left: 46, top: 20 },
  { left: 70, top: 29 },
  { left: 32, top: 52 },
  { left: 58, top: 67 },
  { left: 84, top: 61 },
];

function DestinationMap({
  records,
  onOpen,
}: {
  records: TravelCountryRecord[];
  onOpen: (
    row: TravelCountryRecord
  ) => void;
}) {
  return (
    <section
      className={styles.mapPanel}
      aria-labelledby="overview-map-title"
    >
      <header
        className={styles.mapTitle}
      >
        <div>
          <h2 id="overview-map-title">
            Destination Map
          </h2>

          <p>
            Click a city or town to
            open its accommodation
            and price details.
          </p>
        </div>

        <span
          className={styles.mapHint}
        >
          Illustrative positions ·
          no coordinates in CSV
        </span>
      </header>

      <div
        className={styles.mapCanvas}
      >
        <svg
          className={styles.mapArtwork}
          viewBox="0 0 900 420"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          <rect
            width="900"
            height="420"
            fill="#dfeef5"
          />

          <g
            fill="#e6eadb"
            stroke="#fff"
            strokeWidth="4"
          >
            <path d="M0 46L120 27 202 81 223 142 184 197 213 263 151 295 110 387 0 341Z" />
            <path d="M260 0L449 0 473 52 556 43 622 88 705 96 757 0 900 0 900 295 838 333 773 302 690 342 620 302 570 336 510 278 442 309 399 250 337 248 341 169 288 113Z" />
            <path d="M326 305L406 313 460 420 296 420 273 375Z" />
            <path d="M628 321L740 337 802 420 634 420Z" />
          </g>

          <g
            fill="none"
            stroke="#bfd4d3"
            strokeWidth="2"
            opacity=".7"
          >
            <path d="M413 28L469 138 430 276M542 65L565 190 543 283M300 200L415 225 610 247" />
          </g>
        </svg>

        {records
          .slice(0, 6)
          .map((record, index) => (
            <button
              key={
                record.destination_id
              }
              className={
                styles.mapPin
              }
              type="button"
              onClick={() =>
                onOpen(record)
              }
              aria-label={`Open Accommodation Insights for ${displayLocation(
                record
              )}`}
              style={{
                left: `${
                  POSITIONS[index]
                    .left
                }%`,
                top: `${
                  POSITIONS[index]
                    .top
                }%`,
              }}
            >
              <MapPin
                size={19}
                aria-hidden="true"
              />

              <span
                className={
                  styles.pinCard
                }
              >
                <strong>
                  {record.city_town}
                </strong>

                <small>
                  {record.state_region} ·{" "}
                  {record.country}
                </small>

                <b>
                  {usd(
                    price(
                      record,
                      "hotel_nightly_usd"
                    ) ?? 0
                  )}{" "}
                  <span>
                    / night
                  </span>
                </b>
              </span>
            </button>
          ))}
      </div>
    </section>
  );
}

export function DestinationOverview({
  plan,
  recommendations,
  onOpenDestination,
  onDatesApplied,
}: OverviewProps) {
  const {
    records,
    loading,
    error,
  } = useTravelCountries();

  const [country, setCountry] =
    useState(
      plan.countries[0] ||
        "Spain"
    );
  const [originalRecommendations] = useState(recommendations);
  const [originalDates] = useState(() => ({
    start: plan.checkIn || recommendations?.top10[0]?.days[0]?.date || "",
    end: plan.checkOut || (recommendations?.top10[0]?.days.at(-1)?.date
      ? format(addDays(parseISO(recommendations.top10[0].days.at(-1)!.date), 1), "yyyy-MM-dd") : ""),
  }));
  const [selectedRank, setSelectedRank] = useState(recommendations?.top10[0]?.rank ?? 1);
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(null);
  const [generated, setGenerated] = useState<RecommendationResponse | null>(null);
  const [dateLoading, setDateLoading] = useState(false);
  const [dateError, setDateError] = useState("");
  const originalStart = originalDates.start;
  const originalEnd = originalDates.end;
  const withinOriginal = Boolean(dateRange && dateRange.start >= originalStart && dateRange.end <= originalEnd);
  const activeRecommendations = generated ?? (withinOriginal && originalRecommendations && dateRange ? {
    ...originalRecommendations,
    top10: originalRecommendations.top10.map(item => trimRecommendation(item, dateRange.start, dateRange.end)),
    firstRecommendation: originalRecommendations?.firstRecommendation
      ? trimRecommendation(originalRecommendations.firstRecommendation, dateRange.start, dateRange.end) : null,
  } : recommendations);
  const activeRank = activeRecommendations?.top10.some(item => item.rank === selectedRank)
    ? selectedRank
    : activeRecommendations?.top10[0]?.rank ?? 1;

  async function applyDates(start: string, end: string) {
    if (!originalStart || !originalEnd || start >= end) return;
    setDateError("");
    if (start >= originalStart && end <= originalEnd) {
      if (!originalRecommendations) return;
      const trimmed = {
        ...originalRecommendations,
        top10: originalRecommendations.top10.map(item => trimRecommendation(item, start, end)),
        firstRecommendation: originalRecommendations.firstRecommendation
          ? trimRecommendation(originalRecommendations.firstRecommendation, start, end) : null,
      };
      setGenerated(null);
      setDateRange({ start, end });
      onDatesApplied?.(start, end, trimmed);
      return;
    }
    setDateLoading(true);
    try {
      const response = await fetch("/api/recommendations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: { ...plan, checkIn: start, checkOut: end } }),
      });
      if (!response.ok) throw new Error(`Recommendation request failed (${response.status}).`);
      const payload = await response.text();
      const events = payload.trim().split("\n").map(line => JSON.parse(line) as {
        type: string; result?: RecommendationResponse; message?: string;
      });
      const result = events.findLast(event => event.type === "result")?.result;
      if (!result?.top10.length) throw new Error(events.findLast(event => event.type === "error")?.message || "No recommendations returned for those dates.");
      setGenerated(result);
      setDateRange({ start, end });
      setSelectedRank(result.top10[0]?.rank ?? 1);
      onDatesApplied?.(start, end, result);
    } catch (error) {
      setDateError(error instanceof Error ? error.message : "Could not update travel dates.");
    } finally {
      setDateLoading(false);
    }
  }

  const available = [
    ...new Set(
      records.map(
        row => row.country
      )
    ),
  ].sort();

  const activeCountry =
    available.includes(country)
      ? country
      : available[0] ?? country;

  const current = records
    .filter(
      row =>
        row.country ===
        activeCountry
    )
    .sort(
      (a, b) =>
        comparisonSum(b) -
        comparisonSum(a)
    );

  return (
    <div className={styles.overview}>
      <div
        className={
          styles.pageHeader
        }
      >
        <div>
          <h1>
            Explore Destinations
          </h1>

          <p>
            Explore recommended locations
            and open destination details
            from the map.
          </p>
        </div>

        <span
          className={
            styles.pageStatus
          }
        >
          Destination overview ·
          Page 9
        </span>
      </div>

      {!recommendations && loading && (
        <p
          className={styles.empty}
          role="status"
        >
          Loading CSV destination
          prices…
        </p>
      )}

      {!recommendations && error && (
        <p
          className={
            styles.loadError
          }
          role="alert"
        >
          {error}
        </p>
      )}

      {activeRecommendations && (
        <>
          <DailyTravelPriceChart recommendations={activeRecommendations}
            selectedRank={activeRank} onSelectedRankChange={setSelectedRank}
            travelStart={dateRange?.start || originalStart} travelEnd={dateRange?.end || originalEnd}
            onTravelDatesChange={applyDates} datesLoading={dateLoading} datesError={dateError} />
          <RecommendationMap
            recommendations={activeRecommendations}
            selectedRank={activeRank}
            onSelectedRankChange={setSelectedRank}
            onOpen={onOpenDestination}
          />
        </>
      )}

      {!loading && !error && !recommendations && (
        <>
          <div className={styles.controls}>
            <label htmlFor="overview-country">
              Country
              <select id="overview-country" value={activeCountry}
                onChange={event => setCountry(event.target.value)}>
                {available.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
          </div>

          <DestinationMap
            records={current}
            onOpen={
              onOpenDestination
            }
          />
        </>
      )}
    </div>
  );
}
