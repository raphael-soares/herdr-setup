// Local rows first, then other machines' by name; order within a machine is kept.
export function byMachine(rows) {
  const remote = [...new Set(rows.map((r) => r.w.machine).filter(Boolean))].sort();
  return [...rows.filter((r) => !r.w.machine), ...remote.flatMap((m) => rows.filter((r) => r.w.machine === m))];
}
