// Print-like preview of Form 02 / Form 03, drawn the same way as writeForms lays out the Excel sheet:
// company, lines, title, header rows (VI + EN), data, total row, place/date, signatures, footer.
// With sample data the real rows and filled titles are shown; without, placeholders.
import type { FormOut } from '../../engine/run';
import type { FormDef, Scalar, SignatureRole } from '../../engine/types';
import { fillTemplate, runVars } from '../../engine/util';
import { cellAlign, cellWrap, formatNum, resolveStyle } from '../../excel/formStyle';
import { colWidth } from '../../excel/writeForms';
import { fmt } from '../common';

const MAX_ROWS = 25;

export function FormPreview({ def, out, run, onColumn }: { def: FormDef; out: FormOut | null; run?: Record<string, Scalar>; onColumn?: (index: number) => void }) {
  const L = out?.layout ?? def.layout;
  // style from the definition being edited, so a change shows before the sample is re-run
  const S = resolveStyle(def.layout.style);
  const px = (pt: number) => `${Math.round((pt * 4) / 3)}px`;
  const line = S.border === 'none' ? 'none' : S.border === 'medium' ? '2px solid #333' : S.border === 'hair' ? '1px dotted #555' : '1px solid #555';
  const cellStyle = { border: line } as const;
  const headStyle = { border: line, background: S.headerFill ? `#${S.headerFill}` : 'transparent', color: `#${S.headerColor}`, height: S.headerHeight ? px(S.headerHeight) : undefined };
  const dataStyle = (c: FormDef['columns'][number]) => ({
    ...cellStyle,
    textAlign: cellAlign(c),
    whiteSpace: cellWrap(c) ? ('normal' as const) : ('nowrap' as const),
    height: S.rowHeight ? px(S.rowHeight) : undefined,
  });
  const num = (v: Scalar | undefined) => {
    if (typeof v !== 'number') return <>{fmt(v ?? null)}</>;
    const f = formatNum(v, S.numFmt);
    return f.red ? <span className="fp-red">{f.text}</span> : <>{f.text}</>;
  };
  const vars = out && run ? runVars(run) : {};
  const fill = (t: string | undefined) => (out ? fillTemplate(t ?? '', vars).trim() : (t ?? '').trim());
  const hidden = new Set(out ? out.hidden : def.columns.filter((c) => c.hidden).map((c) => c.id));
  const cols = def.columns.map((c, i) => ({ c, i })).filter(({ c }) => !hidden.has(c.id));
  const n = Math.max(cols.length, 1);
  const labelAt = cols.findIndex(({ c }) => c.type === 'text');
  const totalRow = (
    <tr className="fp-total">
      {cols.map(({ c }, k) => (
        <td key={c.id} style={{ ...cellStyle, textAlign: k === (labelAt < 0 ? 0 : labelAt) ? 'left' : cellAlign(c), fontWeight: S.totalBold ? 700 : 400 }}>
          {k === (labelAt < 0 ? 0 : labelAt) ? L.totalLabel || 'Tổng cộng / Total' : c.type === 'number' && c.total !== false ? (out ? num(out.totals[c.id] ?? 0) : 'Σ') : ''}
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
    <div className="fp-wrap" data-no-text-edit="">
      <div
        className={`fp-paper ${L.orientation === 'portrait' ? 'portrait' : 'landscape'}`}
        style={{ fontFamily: `"${S.fontName}", Calibri, Arial, sans-serif`, fontSize: px(S.fontSize), padding: S.margins === 'narrow' ? '14px 16px' : S.margins === 'wide' ? '36px 44px' : undefined }}
      >
        <div className="fp-paper-meta">
          {S.paperSize} · {L.orientation === 'portrait' ? 'dọc' : 'ngang'}
          {S.fitWidth ? ' · vừa 1 trang ngang' : ''}
        </div>
        {L.companyName && <div className="fp-company">{fill(L.companyName)}</div>}
        {(L.preLines ?? []).map((t, k) => fill(t) && <div key={k} className="fp-pre">{fill(t)}</div>)}
        <div className="fp-title" style={{ fontSize: px(S.titleSize) }}>
          {fill(L.titleVi) || '(tiêu đề)'}
        </div>
        {L.titleEn && (
          <div className="fp-title-en" style={{ fontSize: px(Math.max(6, S.titleSize - 2)) }}>
            {fill(L.titleEn)}
          </div>
        )}
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
                <th key={c.id} style={headStyle} onClick={onColumn ? () => onColumn(i) : undefined} title={onColumn ? 'Bấm để sửa cột này' : undefined}>
                  {c.headerVi || <span className="muted">[{c.id}]</span>}
                </th>
              ))}
            </tr>
            <tr className="fp-en">
              {cols.map(({ c, i }) => (
                <th key={c.id} style={headStyle} onClick={onColumn ? () => onColumn(i) : undefined}>
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
                      <td key={c.id} style={dataStyle(c)}>
                        {c.type === 'number' ? num(r.values[c.id]) : fmt(r.values[c.id] ?? null)}
                      </td>
                    ))}
                  </tr>
                ))
              : [0, 1, 2].map((k) => (
                  <tr key={k} className="fp-placeholder">
                    {cols.map(({ c }) => (
                      <td key={c.id} style={dataStyle(c)}>
                        {c.type === 'number' ? num(0) : '…'}
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
