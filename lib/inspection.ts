export type Verdict = 'pass' | 'fail' | 'unknown';
export type Check = { name: string; verdict: Verdict };
export type Inspection = { id: string; name: string; image: string; thumbnail: string; thumbnailWidth?: number; thumbnailHeight?: number; barcode: string; format: string; checks: Check[]; rawText: string; phase: 'queued'|'reading'|'done'|'error'; error: string; reviewed: boolean; createdAt: string };
export const labels: Record<Verdict,string> = { pass:'✅ 通过', fail:'❌ 不通过', unknown:'待确认' };
export function parseChecks(text: string): Check[] {
  const normalized = text.normalize('NFKC').toUpperCase().replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g,'$1');
  const found = new Map<string,Verdict>();
  // Require an explicit result; never infer PASS from a missing mark or an isolated item name.
  const pattern = /(?:^|[\s,;，；|])([A-Z][A-Z0-9_-]{0,11})\s*[:：=|.-]?\s*(不通过|未通过|不合格|未合格|未检测|待检测|待确认|NOT\s+PASS(?:ED)?|FAIL(?:ED)?|NG|通过|合格|PASS(?:ED)?|OK|✅|✔|✓|❌|✗|×)(?=$|[\s,;，；|])/gu;
  for (const m of normalized.matchAll(pattern)) {
    const status: Verdict = /^(不|未通过|未合格|NOT|FAIL|NG|❌|✗|×)/u.test(m[2]) ? 'fail' : /^(未检测|待)/u.test(m[2]) ? 'unknown' : 'pass';
    found.set(m[1],found.has(m[1]) && found.get(m[1])!==status ? 'unknown' : status);
  }
  return found.size ? [...found].map(([name,verdict])=>({name,verdict})) : ['A','B','P'].map(name=>({name,verdict:'unknown'}));
}
export function needsReview(record: Inspection) { return !record.reviewed || !record.barcode.trim() || !record.checks.length || record.checks.some(c=>c.verdict==='unknown'); }
export function validateChecks(checks: Check[]) {
  if (!checks.length) return '请至少保留一个检测项。';
  if (checks.some(c=>!c.name.trim())) return '检测项名称不能为空。';
  const names=checks.map(c=>c.name.trim().toUpperCase());
  if(new Set(names).size!==names.length) return '检测项名称不能重复。';
  return '';
}
