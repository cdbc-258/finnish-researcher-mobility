from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
from typing import Any

import pandas as pd


PERIOD_SHEETS = {
    "2008-2018": "AU_Mobility_2008-2018",
    "2009-2013": "AU_Mobility_2009-2013",
    "2014-2018": "AU_Mobility_2014-2018",
}

MATRIX_SHEETS = {
    "2008-2018": "AU_Mobility_2008-2018",
    "2009-2013": "AU_Mobility_2009-2013",
    "2014-2018": "AU_Mobility_2014-2018",
}

CITY_COORDINATES = {
    "Espoo": (60.2055, 24.6559),
    "Hameenlinna": (60.9959, 24.4643),
    "Helsinki": (60.1699, 24.9384),
    "Jarvenpaa": (60.4737, 25.0899),
    "Joensuu": (62.6010, 29.7636),
    "Jyvaskyla": (62.2426, 25.7473),
    "Kotka": (60.4664, 26.9458),
    "Kuopio": (62.8924, 27.6770),
    "Lahti": (60.9827, 25.6615),
    "Lappeenranta": (61.0587, 28.1887),
    "Lohja": (60.2486, 24.0653),
    "Mikkeli": (61.6886, 27.2723),
    "Nurmijarvi": (60.4641, 24.8073),
    "Oulu": (65.0121, 25.4651),
    "Pori": (61.4851, 21.7972),
    "Porvoo": (60.3932, 25.6651),
    "Rauma": (61.1272, 21.5113),
    "Tampere": (61.4978, 23.7610),
    "Turku": (60.4518, 22.2666),
    "Vaasa": (63.0951, 21.6165),
    "Vantaa": (60.2934, 25.0378),
    "Other": (59.65, 29.9),
}


def _to_int(value: Any) -> int:
    if pd.isna(value):
        return 0
    return int(value)


def _read_network(workbook: Path) -> dict[str, pd.DataFrame]:
    period_frames: dict[str, pd.DataFrame] = {}
    for period, sheet in PERIOD_SHEETS.items():
        frame = pd.read_excel(workbook, sheet_name=sheet)
        frame = frame[["From", "To", "Times"]].copy()
        frame["From"] = frame["From"].astype(str).str.strip()
        frame["To"] = frame["To"].astype(str).str.strip()
        frame["Times"] = frame["Times"].map(_to_int)
        period_frames[period] = frame
    return period_frames


def _node_type(net: int, total: int) -> str:
    if total == 0:
        return "balanced"
    ratio = net / total
    if ratio > 0.08:
        return "inflow"
    if ratio < -0.08:
        return "outflow"
    return "balanced"


def _make_nodes(period_frames: dict[str, pd.DataFrame]) -> list[dict[str, Any]]:
    cities = sorted(
        set().union(
            *[
                set(frame["From"].unique()).union(frame["To"].unique())
                for frame in period_frames.values()
            ]
        )
    )
    baseline = period_frames["2008-2018"]
    totals: dict[str, dict[str, int]] = {
        city: {"incoming": 0, "outgoing": 0, "self": 0} for city in cities
    }

    for row in baseline.itertuples(index=False):
        source = row.From
        target = row.To
        value = int(row.Times)
        totals[source]["outgoing"] += value
        totals[target]["incoming"] += value
        if source == target:
            totals[source]["self"] += value

    max_total = max(
        (stats["incoming"] + stats["outgoing"] for stats in totals.values()),
        default=1,
    )

    nodes = []
    for city in cities:
        if city not in CITY_COORDINATES:
            raise ValueError(f"缺少城市坐标: {city}")
        lat, lon = CITY_COORDINATES[city]
        incoming = totals[city]["incoming"]
        outgoing = totals[city]["outgoing"]
        total = incoming + outgoing
        net = incoming - outgoing
        nodes.append(
            {
                "id": city,
                "label": "Other regions" if city == "Other" else city,
                "lat": lat,
                "lon": lon,
                "incoming": incoming,
                "outgoing": outgoing,
                "self": totals[city]["self"],
                "net": net,
                "total": total,
                "centrality": round(total / max_total, 6),
                "type": _node_type(net, total),
            }
        )

    nodes.sort(key=lambda item: item["total"], reverse=True)
    for index, node in enumerate(nodes, start=1):
        node["rank"] = index
    return nodes


def _make_links(period_frames: dict[str, pd.DataFrame]) -> dict[str, list[dict[str, Any]]]:
    result: dict[str, list[dict[str, Any]]] = {}
    for period, frame in period_frames.items():
        max_value = int(frame["Times"].max()) or 1
        links = []
        for rank, row in enumerate(
            frame.sort_values("Times", ascending=False).itertuples(index=False),
            start=1,
        ):
            source = row.From
            target = row.To
            value = int(row.Times)
            links.append(
                {
                    "source": source,
                    "target": target,
                    "value": value,
                    "period": period,
                    "isSelf": source == target,
                    "rank": rank,
                    "normalized": round(value / max_value, 6),
                    "pairKey": " -- ".join(sorted([source, target])),
                }
            )
        result[period] = links
    return result


def _make_matrix(matrix_workbook: Path) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for period, sheet in MATRIX_SHEETS.items():
        frame = pd.read_excel(matrix_workbook, sheet_name=sheet)
        frame = frame.rename(columns={frame.columns[0]: "From"})
        cities = [str(city).strip() for city in frame["From"].tolist()]
        value_frame = frame.drop(columns=["From"]).fillna(0)
        values = value_frame.astype(int).values.tolist()
        max_value = max((max(row) for row in values), default=0)
        result[period] = {
            "cities": cities,
            "values": values,
            "maxValue": int(max_value),
        }
    return result


def _summarize_period(frame: pd.DataFrame) -> dict[str, int]:
    total = int(frame["Times"].sum())
    self_total = int(frame.loc[frame["From"] == frame["To"], "Times"].sum())
    return {
        "total": total,
        "self": self_total,
        "nonSelf": total - self_total,
        "edges": int(len(frame)),
    }


def _retention_mobility(frame: pd.DataFrame) -> dict[str, Any]:
    summary = _summarize_period(frame)
    total = summary["total"] or 1
    return {
        **summary,
        "selfRate": round(summary["self"] / total, 6),
        "nonSelfRate": round(summary["nonSelf"] / total, 6),
    }


def _net_inflow_rates(frame: pd.DataFrame) -> list[dict[str, Any]]:
    cities = sorted(set(frame["From"]).union(frame["To"]))
    incoming = frame.groupby("To")["Times"].sum().to_dict()
    outgoing = frame.groupby("From")["Times"].sum().to_dict()
    rows = []
    for city in cities:
        in_value = int(incoming.get(city, 0))
        out_value = int(outgoing.get(city, 0))
        denominator = in_value + out_value
        rate = 0 if denominator == 0 else (in_value - out_value) / denominator
        rows.append(
            {
                "city": city,
                "incoming": in_value,
                "outgoing": out_value,
                "net": in_value - out_value,
                "netInflowRate": round(rate, 6),
                "absRate": round(abs(rate), 6),
                "total": denominator,
            }
        )
    rows.sort(key=lambda item: (item["absRate"], item["total"]), reverse=True)
    return rows


def _asymmetry_pairs(frame: pd.DataFrame) -> list[dict[str, Any]]:
    flow_map = {
        (row.From, row.To): int(row.Times)
        for row in frame.itertuples(index=False)
        if row.From != row.To
    }
    pair_keys = {tuple(sorted(pair)) for pair in flow_map}
    rows = []
    for city_a, city_b in pair_keys:
        forward = flow_map.get((city_a, city_b), 0)
        backward = flow_map.get((city_b, city_a), 0)
        total = forward + backward
        if total == 0:
            continue
        asymmetry = (forward - backward) / total
        dominant = city_a if asymmetry > 0 else city_b if asymmetry < 0 else "Balanced"
        rows.append(
            {
                "cityA": city_a,
                "cityB": city_b,
                "forward": forward,
                "backward": backward,
                "total": total,
                "asymmetry": round(asymmetry, 6),
                "absAsymmetry": round(abs(asymmetry), 6),
                "dominant": dominant,
            }
        )
    rows.sort(key=lambda item: (item["absAsymmetry"], item["total"]), reverse=True)
    return rows


def _herfindahl_outgoing(frame: pd.DataFrame) -> list[dict[str, Any]]:
    rows = []
    non_self = frame[frame["From"] != frame["To"]]
    for city, group in non_self.groupby("From"):
        total = int(group["Times"].sum())
        if total == 0:
            continue
        shares = group["Times"] / total
        hhi = float((shares * shares).sum())
        top_destination_row = group.sort_values("Times", ascending=False).iloc[0]
        rows.append(
            {
                "city": city,
                "hhi": round(hhi, 6),
                "outgoingNonSelf": total,
                "destinations": int(group["To"].nunique()),
                "topDestination": str(top_destination_row["To"]),
                "topDestinationShare": round(float(top_destination_row["Times"] / total), 6),
            }
        )
    rows.sort(key=lambda item: (item["hhi"], item["outgoingNonSelf"]), reverse=True)
    return rows


def _community_network(frame: pd.DataFrame) -> tuple[list[str], dict[tuple[str, str], int], dict[str, int]]:
    cities = sorted(set(frame["From"]).union(frame["To"]))
    edge_weights: dict[tuple[str, str], int] = defaultdict(int)
    degrees = {city: 0 for city in cities}
    for row in frame.itertuples(index=False):
        source = row.From
        target = row.To
        value = int(row.Times)
        if source == target or value == 0:
            continue
        city_a, city_b = sorted([source, target])
        edge_weights[(city_a, city_b)] += value
        degrees[source] += value
        degrees[target] += value
    return cities, dict(edge_weights), degrees


def _community_modularity(
    communities: list[frozenset[str]],
    edge_weights: dict[tuple[str, str], int],
    degrees: dict[str, int],
    total_weight: int,
) -> float:
    if total_weight == 0:
        return 0.0
    score = 0.0
    for community in communities:
        internal_weight = 0
        for city_a, city_b in edge_weights:
            if city_a in community and city_b in community:
                internal_weight += edge_weights[(city_a, city_b)]
        degree_sum = sum(degrees[city] for city in community)
        score += internal_weight / total_weight - (degree_sum / (2 * total_weight)) ** 2
    return score


def _community_internal_weight(
    community: frozenset[str],
    edge_weights: dict[tuple[str, str], int],
) -> int:
    return int(
        sum(
            weight
            for (city_a, city_b), weight in edge_weights.items()
            if city_a in community and city_b in community
        )
    )


def _detect_communities(frame: pd.DataFrame) -> dict[str, Any]:
    cities, edge_weights, degrees = _community_network(frame)
    total_weight = sum(edge_weights.values())
    if total_weight == 0:
        groups = [
            {
                "id": f"C{index}",
                "cities": [city],
                "size": 1,
                "internalWeight": 0,
                "degreeWeight": 0,
            }
            for index, city in enumerate(cities, start=1)
        ]
        return {
            "communityCount": len(groups),
            "modularity": 0.0,
            "groups": groups,
            "memberships": [
                {"city": group["cities"][0], "community": group["id"]} for group in groups
            ],
        }

    communities = [frozenset([city]) for city in cities]
    current_q = _community_modularity(communities, edge_weights, degrees, total_weight)
    improved = True
    while improved and len(communities) > 1:
        improved = False
        best_gain = 0.0
        best_merge: tuple[int, int] | None = None
        for left_index in range(len(communities)):
            for right_index in range(left_index + 1, len(communities)):
                merged = communities[left_index] | communities[right_index]
                candidate = [
                    community
                    for index, community in enumerate(communities)
                    if index not in (left_index, right_index)
                ]
                candidate.append(merged)
                candidate_q = _community_modularity(
                    candidate,
                    edge_weights,
                    degrees,
                    total_weight,
                )
                gain = candidate_q - current_q
                if gain > best_gain:
                    best_gain = gain
                    best_merge = (left_index, right_index)
        if best_merge is not None and best_gain > 1e-9:
            left_index, right_index = best_merge
            merged = communities[left_index] | communities[right_index]
            communities = [
                community
                for index, community in enumerate(communities)
                if index not in (left_index, right_index)
            ]
            communities.append(merged)
            communities.sort(key=lambda group: (-len(group), sorted(group)[0]))
            current_q += best_gain
            improved = True

    ordered = sorted(
        communities,
        key=lambda group: (
            -_community_internal_weight(group, edge_weights),
            -sum(degrees[city] for city in group),
            sorted(group)[0],
        ),
    )
    groups = []
    memberships = []
    for index, community in enumerate(ordered, start=1):
        community_id = f"C{index}"
        cities_in_group = sorted(community)
        internal_weight = _community_internal_weight(community, edge_weights)
        degree_weight = int(sum(degrees[city] for city in community))
        groups.append(
            {
                "id": community_id,
                "cities": cities_in_group,
                "size": len(cities_in_group),
                "internalWeight": internal_weight,
                "degreeWeight": degree_weight,
                "internalShare": round(internal_weight / total_weight, 6),
            }
        )
        for city in cities_in_group:
            memberships.append({"city": city, "community": community_id})

    memberships.sort(key=lambda item: item["city"])
    return {
        "communityCount": len(groups),
        "modularity": round(current_q, 6),
        "groups": groups,
        "memberships": memberships,
    }


def _city_rankings(frame: pd.DataFrame) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    incoming = (
        frame.groupby("To")["Times"]
        .sum()
        .sort_values(ascending=False)
        .head(10)
        .reset_index()
    )
    outgoing = (
        frame.groupby("From")["Times"]
        .sum()
        .sort_values(ascending=False)
        .head(10)
        .reset_index()
    )
    top_incoming = [
        {"city": row.To, "value": int(row.Times)}
        for row in incoming.itertuples(index=False)
    ]
    top_outgoing = [
        {"city": row.From, "value": int(row.Times)}
        for row in outgoing.itertuples(index=False)
    ]
    return top_incoming, top_outgoing


def _changed_links(period_frames: dict[str, pd.DataFrame]) -> list[dict[str, Any]]:
    earlier = period_frames["2009-2013"]
    later = period_frames["2014-2018"]
    earlier_map = {
        (row.From, row.To): int(row.Times)
        for row in earlier.itertuples(index=False)
        if row.From != row.To
    }
    later_map = {
        (row.From, row.To): int(row.Times)
        for row in later.itertuples(index=False)
        if row.From != row.To
    }
    keys = set(earlier_map) | set(later_map)
    changes = []
    for source, target in keys:
        before = earlier_map.get((source, target), 0)
        after = later_map.get((source, target), 0)
        delta = after - before
        changes.append(
            {
                "source": source,
                "target": target,
                "before": before,
                "after": after,
                "delta": delta,
                "absDelta": abs(delta),
                "changeRate": None if before == 0 else round(delta / before, 4),
            }
        )
    changes.sort(key=lambda item: item["absDelta"], reverse=True)
    return changes[:25]


def _strongest_pairs(frame: pd.DataFrame) -> list[dict[str, Any]]:
    pairs: dict[tuple[str, str], dict[str, Any]] = defaultdict(
        lambda: {"source": "", "target": "", "forward": 0, "backward": 0, "total": 0}
    )
    for row in frame.itertuples(index=False):
        source = row.From
        target = row.To
        if source == target:
            continue
        first, second = sorted([source, target])
        record = pairs[(first, second)]
        record["source"] = first
        record["target"] = second
        value = int(row.Times)
        if source == first and target == second:
            record["forward"] += value
        else:
            record["backward"] += value
        record["total"] += value
    ordered = sorted(pairs.values(), key=lambda item: item["total"], reverse=True)
    return ordered[:20]


def _make_summary(period_frames: dict[str, pd.DataFrame]) -> dict[str, Any]:
    baseline = period_frames["2008-2018"]
    non_self = baseline[baseline["From"] != baseline["To"]].sort_values(
        "Times", ascending=False
    )
    top_incoming, top_outgoing = _city_rankings(baseline)
    return {
        "periods": list(PERIOD_SHEETS.keys()),
        "periodTotals": {
            period: _summarize_period(frame) for period, frame in period_frames.items()
        },
        "retentionMobility": {
            period: _retention_mobility(frame) for period, frame in period_frames.items()
        },
        "netInflowRates": {
            period: _net_inflow_rates(frame) for period, frame in period_frames.items()
        },
        "asymmetryPairs": {
            period: _asymmetry_pairs(frame) for period, frame in period_frames.items()
        },
        "herfindahlOutgoing": {
            period: _herfindahl_outgoing(frame) for period, frame in period_frames.items()
        },
        "communities": {
            period: _detect_communities(frame) for period, frame in period_frames.items()
        },
        "topLinks": [
            {
                "source": row.From,
                "target": row.To,
                "value": int(row.Times),
                "period": "2008-2018",
            }
            for row in non_self.head(30).itertuples(index=False)
        ],
        "topIncoming": top_incoming,
        "topOutgoing": top_outgoing,
        "changedLinks": _changed_links(period_frames),
        "strongestPairs": _strongest_pairs(baseline),
        "findings": [
            "Helsinki 与 Lappeenranta 之间形成最强的双向迁移通道。",
            "城市流动网络呈现明显核心-边缘结构，Helsinki 是最重要的连接枢纽。",
            "对角线自循环数值很高，说明同城科研活动留存仍占较大比例。",
            "2009-2013 与 2014-2018 对比可观察到部分核心通道继续增强。",
        ],
    }


def _make_retention(period_frames: dict[str, pd.DataFrame]) -> dict[str, list[dict[str, Any]]]:
    """Compute per-city per-period retention rate: self / outgoing."""
    result: dict[str, list[dict[str, Any]]] = {}
    for period, frame in period_frames.items():
        cities = sorted(set(frame["From"].unique()).union(frame["To"].unique()))
        outgoing = frame.groupby("From")["Times"].sum().to_dict()
        self_flow = frame[frame["From"] == frame["To"]].groupby("From")["Times"].sum().to_dict()
        rows = []
        for city in cities:
            out_v = int(outgoing.get(city, 0))
            self_v = int(self_flow.get(city, 0))
            non_self = out_v - self_v
            rate = round(self_v / out_v, 6) if out_v > 0 else 0.0
            rows.append({
                "city": city,
                "self": self_v,
                "outgoing": out_v,
                "nonSelf": non_self,
                "retentionRate": rate,
            })
        rows.sort(key=lambda r: r["retentionRate"], reverse=True)
        result[period] = rows
    return result


def _make_diff_matrix(matrix_workbook: Path) -> dict[str, Any]:
    """Compute cell-by-cell difference matrix between late (2014-2018) and early (2009-2013)."""
    matrices = _make_matrix(matrix_workbook)
    early = matrices.get("2009-2013")
    late = matrices.get("2014-2018")
    if early is None or late is None:
        return {"cities": [], "diffValues": [], "earlyValues": [], "lateValues": [], "maxAbsDiff": 0}

    # Unify city list (union of both periods, sorted)
    all_cities = sorted(set(early["cities"]) | set(late["cities"]))
    n = len(all_cities)
    early_idx = {c: i for i, c in enumerate(early["cities"])}
    late_idx = {c: i for i, c in enumerate(late["cities"])}

    diff_values = [[0] * n for _ in range(n)]
    early_values = [[0] * n for _ in range(n)]
    late_values = [[0] * n for _ in range(n)]
    max_abs = 0

    for i, from_city in enumerate(all_cities):
        for j, to_city in enumerate(all_cities):
            ev = early["values"][early_idx[from_city]][early_idx[to_city]] if from_city in early_idx and to_city in early_idx else 0
            lv = late["values"][late_idx[from_city]][late_idx[to_city]] if from_city in late_idx and to_city in late_idx else 0
            diff = lv - ev
            early_values[i][j] = ev
            late_values[i][j] = lv
            diff_values[i][j] = diff
            if abs(diff) > max_abs:
                max_abs = abs(diff)

    return {
        "cities": all_cities,
        "diffValues": diff_values,
        "earlyValues": early_values,
        "lateValues": late_values,
        "maxAbsDiff": max_abs,
    }


def build_city_data(workbook: Path, matrix_workbook: Path) -> dict[str, Any]:
    period_frames = _read_network(workbook)
    return {
        "city_nodes": _make_nodes(period_frames),
        "city_links": _make_links(period_frames),
        "city_matrix": _make_matrix(matrix_workbook),
        "city_summary": _make_summary(period_frames),
        "city_retention": _make_retention(period_frames),
        "city_diff_matrix": _make_diff_matrix(matrix_workbook),
    }


def write_outputs(result: dict[str, Any], output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    for name, data in result.items():
        path = output_dir / f"{name}.json"
        path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )


def main() -> None:
    base = Path(__file__).resolve().parents[1]
    result = build_city_data(
        base / "raw_data" / "Author_Mobility_Network.xlsx",
        base / "raw_data" / "Authors_Mobility_Matrix.xlsx",
    )
    write_outputs(result, base / "data")


if __name__ == "__main__":
    main()
