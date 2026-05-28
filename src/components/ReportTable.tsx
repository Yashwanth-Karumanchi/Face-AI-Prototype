import type { FullReport } from "../types";
import { safeMetric } from "../utils/image";

export function ReportTable({ report }: { report: FullReport }) {
  const rows = [report.imageQuality, report.face, ...report.indicators];
  return (
    <div className="tableWrap">
      <table>
        <thead>
          <tr>
            <th>Indicator</th>
            <th>Result</th>
            <th>Score</th>
            <th>Confidence</th>
            <th>Reliable</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.indicator}>
              <td>{row.indicator}</td>
              <td>{row.result}</td>
              <td>{safeMetric(row.score)}</td>
              <td>{row.confidence}</td>
              <td>{row.reliable ? "Yes" : "No"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
