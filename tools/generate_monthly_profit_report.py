#!/usr/bin/env python3
import csv
import math
import pathlib
import statistics
import sys

PRO_PRICE = 6900
BUSINESS_PRICE = 19900
TOPUP10_PRICE = 1000
TOPUP10_REQUESTS = 10
PRO_MAX_REQUESTS = 100


def to_int(row, key):
    return int(float(row[key]))


def to_float(row, key):
    return float(row[key])


def parse_rows(csv_path):
    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        required = {
            "month",
            "pro_subscribers",
            "business_subscribers",
            "topup10_packs",
            "pro_avg_requests",
            "business_avg_requests",
            "cost_per_request_krw",
            "infra_fixed_krw",
        }
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"CSV 필수 컬럼 누락: {', '.join(sorted(missing))}")

        rows = []
        for r in reader:
            month = str(r["month"]).strip()
            if not month:
                continue
            pro_subs = to_int(r, "pro_subscribers")
            biz_subs = to_int(r, "business_subscribers")
            topup_packs = to_int(r, "topup10_packs")
            pro_avg_req = to_float(r, "pro_avg_requests")
            biz_avg_req = to_float(r, "business_avg_requests")
            cpr = to_float(r, "cost_per_request_krw")
            infra_fixed = to_float(r, "infra_fixed_krw")

            pro_requests = pro_subs * min(pro_avg_req, PRO_MAX_REQUESTS)
            biz_requests = biz_subs * biz_avg_req
            topup_requests = topup_packs * TOPUP10_REQUESTS
            total_requests = pro_requests + biz_requests + topup_requests

            revenue = (pro_subs * PRO_PRICE) + (biz_subs * BUSINESS_PRICE) + (topup_packs * TOPUP10_PRICE)
            variable_cost = total_requests * cpr
            total_cost = variable_cost + infra_fixed
            gross_profit = revenue - total_cost
            margin_pct = (gross_profit / revenue * 100.0) if revenue else 0.0

            rows.append(
                {
                    "month": month,
                    "pro_subscribers": pro_subs,
                    "business_subscribers": biz_subs,
                    "topup10_packs": topup_packs,
                    "pro_requests": pro_requests,
                    "business_requests": biz_requests,
                    "topup_requests": topup_requests,
                    "total_requests": total_requests,
                    "cost_per_request_krw": cpr,
                    "infra_fixed_krw": infra_fixed,
                    "revenue_krw": revenue,
                    "total_cost_krw": total_cost,
                    "gross_profit_krw": gross_profit,
                    "margin_pct": margin_pct,
                }
            )
        return rows


def k(n):
    return f"{int(round(n)):,}"


def f1(n):
    return f"{n:.1f}"


def mermaid_xy(title, x_label, x_values, y_label, y_min, y_max, y_values):
    x_str = ",".join(x_values)
    y_str = ",".join(f1(v) for v in y_values)
    return "\n".join(
        [
            "```mermaid",
            "xychart-beta",
            f'  title "{title}"',
            f'  x-axis "{x_label}" [{x_str}]',
            f'  y-axis "{y_label}" {int(math.floor(y_min))} --> {int(math.ceil(y_max))}',
            f"  line [{y_str}]",
            "```",
        ]
    )


def build_report(rows, csv_path):
    if not rows:
        raise ValueError("분석할 데이터가 없습니다.")

    months = [r["month"] for r in rows]
    revenue = [r["revenue_krw"] for r in rows]
    cost = [r["total_cost_krw"] for r in rows]
    profit = [r["gross_profit_krw"] for r in rows]
    margin = [r["margin_pct"] for r in rows]

    avg_margin = statistics.mean(margin)
    deficit_months = [r["month"] for r in rows if r["gross_profit_krw"] < 0]

    lines = []
    lines.append("# 월별 수익률 보고서 (자동생성)")
    lines.append("")
    lines.append(f"- 입력 CSV: `{csv_path}`")
    lines.append(f"- 분석 월 수: {len(rows)}")
    lines.append(f"- 평균 수익률: {f1(avg_margin)}%")
    if deficit_months:
        lines.append(f"- 적자 월: {', '.join(deficit_months)}")
    else:
        lines.append("- 적자 월: 없음")
    lines.append("")

    lines.append("## 월별 요약")
    lines.append("")
    lines.append("| 월 | 매출(원) | 총원가(원) | 영업이익(원) | 수익률(%) | 총요청수 |")
    lines.append("|---|---:|---:|---:|---:|---:|")
    for r in rows:
        lines.append(
            f"| {r['month']} | {k(r['revenue_krw'])} | {k(r['total_cost_krw'])} | {k(r['gross_profit_krw'])} | {f1(r['margin_pct'])} | {k(r['total_requests'])} |"
        )
    lines.append("")

    lines.append("## 그래프 1: 월별 수익률")
    lines.append("")
    y_min = min(margin + [0]) - 5
    y_max = max(margin + [0]) + 5
    lines.append(mermaid_xy("월별 수익률", "월", months, "수익률(%)", y_min, y_max, margin))
    lines.append("")

    lines.append("## 그래프 2: 매출 vs 총원가")
    lines.append("")
    y_min2 = 0
    y_max2 = max(revenue + cost) * 1.1
    lines.append(mermaid_xy("매출", "월", months, "금액(원)", y_min2, y_max2, revenue))
    lines.append("")
    lines.append(mermaid_xy("총원가", "월", months, "금액(원)", y_min2, y_max2, cost))
    lines.append("")

    lines.append("## 그래프 3: 영업이익")
    lines.append("")
    y_min3 = min(profit + [0]) * 1.1
    y_max3 = max(profit + [0]) * 1.1 if max(profit + [0]) > 0 else 1000
    lines.append(mermaid_xy("월별 영업이익", "월", months, "이익(원)", y_min3, y_max3, profit))
    lines.append("")

    lines.append("## 참고 계산")
    lines.append("")
    lines.append("- Pro는 1인당 최대 100회까지만 비용 계산(플랜 한도 반영)")
    lines.append("- Business는 무제한 구조이므로 실제 평균 요청 수가 수익성 핵심")
    lines.append("- Top-up 1팩은 10회 요청 비용 반영")
    lines.append("")

    return "\n".join(lines)


def main():
    if len(sys.argv) < 2:
        print("사용법: python3 tools/generate_monthly_profit_report.py <csv_path> [output_md_path]")
        sys.exit(1)

    csv_path = pathlib.Path(sys.argv[1]).resolve()
    out_path = (
        pathlib.Path(sys.argv[2]).resolve()
        if len(sys.argv) >= 3
        else pathlib.Path(
            "/home/dowon/securedir/git/codex/projects/260322_polite_message_extension/reports/monthly-profit-report.md"
        )
    )

    rows = parse_rows(csv_path)
    report = build_report(rows, str(csv_path))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(report, encoding="utf-8")
    print(f"보고서 생성 완료: {out_path}")


if __name__ == "__main__":
    main()
