// Print-like preview of Form 02 / Form 03, drawn the same way as writeForms lays out the Excel sheet:
// company, lines, title, header rows (VI + EN), data, total row, place/date, signatures, footer.
// With sample data the real rows and filled titles are shown; without, placeholders.
import type { FormOut } from '../../engine/run';
import type { FormDef, Scalar, SignatureRole } from '../../engine/types';
import { fillTemplate, runVars } from '../../engine/util';
import { colWidth } from '../../excel/writeForms';
import { fmt } from '../common';

const MAX_ROWS = 25;

export function FormPreview({ def, out, run, onColumn }: { def: FormDef; out: FormOut | null; run?: Record<string, Scalar>; onColumn?: (index: number) => void }) {
  const L = out?.layout ?? def.layout;
  const vars = out && run ? runVars(run) : {};
  const fill = (t: string | undefined) => (out ? fillTemplate(t ?? '', vars).trim() : (t ?? '').trim());
  const hidden = new Set(out ? out.hidden : def.columns.filter((c) => c.hidden).map((c) => c.id));
  const cols = def.columns.map((c, i) => ({ c, i })).filter(({ c }) => !hidden.has(c.id));
  const n = Math.max(cols.length, 1);
  const labelAt = cols.findIndex(({ c }) => c.type === 'text');
  const totalRow = (
    <tr className="fp-total">
      {cols.map(({ c }, k) => (
        <td key={c.id} className={c.type === 'number' ? 'num' : undefined}>
          {k === (labelAt < 0 ? 0 : labelAt) ? L.totalLabel || 'Tổng cộng / Total' : c.type === 'number' && c.total !== false ? (out ? fmt(out.totals[c.id] ?? 0) : 'Σ') : ''}
        </td>
      ))}
    </tr>
  );
  const rows = out ? out.rows.slice(0, MAX_ROWS) : [];
  const signatures = (roles: SignatureRole[], key: string) =>
    roles.length > 0 && (
      <div className="fp-signs" key={key} style={{ gridTemplateColumns: `repeat(${roles.length}, 1fr)` }}>
        {roles.map((r, k) => (
          <div key={k} className="fp-sign">
            <strong>{fill(r.title) || '(chức danh)'}</strong>
            {r.titleEn && <em>{fill(r.titleEn)}</em>}
            <span className="fp-sign-space" />
            <strong>{r.nameParam ? String(vars[r.nameParam] ?? '') || `{${r.nameParam}}` : r.name || ''}</strong>
          </div>
        ))}
      </div>
    );
  return (
    <div className="fp-wrap">
      <div className={`fp-paper ${L.orientation === 'portrait' ? 'portrait' : 'landscape'}`}>
        {L.companyName && <div className="fp-company">{fill(L.companyName)}</div>}
        {(L.preLines ?? []).map((t, k) => fill(t) && <div key={k} className="fp-pre">{fill(t)}</div>)}
        <div className="fp-title">{fill(L.titleVi) || '(tiêu đề)'}</div>
        {L.titleEn && <div className="fp-title-en">{fill(L.titleEn)}</div>}
        {(L.extraLines ?? []).map((t, k) => fill(t) && <div key={k} className="fp-pre">{fill(t)}</div>)}
        <table className="fp-table">
          <colgroup>
            {cols.map(({ c }) => (
              <col key={c.id} style={{ width: `${colWidth(c) * 7}px` }} />
            ))}
          </colgroup>
          <thead>
            {L.totalPosition === 'top' && totalRow}
            <tr>
              {cols.map(({ c, i }) => (
                <th key={c.id} onClick={onColumn ? () => onColumn(i) : undefined} title={onColumn ? 'Bấm để sửa cột này' : undefined}>
                  {c.headerVi || <span className="muted">[{c.id}]</span>}
                </th>
              ))}
            </tr>
            <tr className="fp-en">
              {cols.map(({ c, i }) => (
                <th key={c.id} onClick={onColumn ? () => onColumn(i) : undefined}>
                  {c.headerEn}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {out
              ? rows.map((r, k) => (
                  <tr key={k}>
                    {cols.map(({ c }) => (
                      <td key={c.id} className={c.type === 'number' ? 'num' : undefined}>
                        {fmt(r.values[c.id] ?? null)}
                      </td>
                    ))}
                  </tr>
                ))
              : [0, 1, 2].map((k) => (
                  <tr key={k} className="fp-placeholder">
                    {cols.map(({ c }) => (
                      <td key={c.id} className={c.type === 'number' ? 'num' : undefined}>
                        {c.type === 'number' ? '0' : '…'}
                      </td>
                    ))}
                  </tr>
                ))}
            {out && out.rows.length > MAX_ROWS && (
              <tr className="fp-more">
                <td colSpan={n}>… còn {out.rows.length - MAX_ROWS} dòng</td>
              </tr>
            )}
            {out && !out.rows.length && (
              <tr className="fp-more">
                <td colSpan={n}>Dữ liệu mẫu không có dòng nào vào form này</td>
              </tr>
            )}
          </tbody>
          {L.totalPosition !== 'top' && <tfoot>{totalRow}</tfoot>}
        </table>
        {L.placeDate && <div className="fp-place">{fill(L.placeDate)}</div>}
        {signatures(L.signatures ?? [], 'main')}
        {(L.footer ?? []).map((b, k) =>
          b.kind === 'signatures' ? (
            signatures(b.roles ?? [], `f${k}`)
          ) : (
            <div key={k} className={b.align === 'right' ? 'fp-text right' : 'fp-text'}>
              {(b.lines ?? []).map((t, j) => (
                <div key={j}>{fill(t) || ' '}</div>
              ))}
            </div>
          ),
        )}
      </div>
      {!out && <p className="muted small">Đang xem bố cục với dữ liệu giả. Nạp dữ liệu mẫu để thấy số thật và tiêu đề đã điền tháng / năm.</p>}
    </div>
  );
}
