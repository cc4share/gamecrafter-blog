type ProjectPeriod = { start: string; end: string | null } | null | undefined;

const yearOf=(value:string)=>{
  const match=/^(\d{4})/.exec(value);
  return match?.[1]??'';
};

export function formatProjectPeriod(period:ProjectPeriod) {
  if(!period?.start) return '';
  const start=yearOf(period.start);
  if(!start) return '';
  if(!period.end) return `${start} — 现在`;
  const end=yearOf(period.end);
  return !end||end===start?start:`${start} — ${end}`;
}
