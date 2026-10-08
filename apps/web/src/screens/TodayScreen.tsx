import type { ReadinessDashboardScreenProps, ReadinessRowViewModel } from '@certa/contract';
import { AsyncFrame, Badge } from './_placeholder';

function Rows({ title, rows, onOpen }: { title: string; rows: ReadinessRowViewModel[]; onOpen: (href: string) => void }) {
  return (
    <section>
      <h2>{title}</h2>
      <ul>
        {rows.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => onOpen(r.href)}>{r.name}</button> <Badge status={r.status} />
            {r.reasons.map((x, i) => <div key={i}>{x.text}{x.due ? ` — ${x.due.display}` : ''}</div>)}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function TodayScreen(props: ReadinessDashboardScreenProps) {
  const isEmpty = props.pilots.length === 0 && props.aircraft.length === 0;
  return (
    <AsyncFrame state={props}>
      <h1>Today · {props.asOf.absolute}</h1>
      {isEmpty ? (
        <section data-testid="today-empty">
          <h2>{props.empty.title}</h2>
          <p>{props.empty.body}</p>
          {props.empty.actionLabel && <button type="button" onClick={props.onAddAircraft}>{props.empty.actionLabel}</button>}
        </section>
      ) : (
        <>
          <p><Badge status={props.overall} /> · {props.counts.green} current · {props.counts.amber} attention · {props.counts.red} not current</p>
          <Rows title="Pilots" rows={props.pilots} onOpen={props.onOpen} />
          <Rows title="Aircraft" rows={props.aircraft} onOpen={props.onOpen} />
        </>
      )}
    </AsyncFrame>
  );
}
