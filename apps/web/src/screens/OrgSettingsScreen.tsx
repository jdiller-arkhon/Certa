import type { OrgSettingsScreenProps } from '@certa/contract';
import { useEffect, useState } from 'react';
import { AsyncFrame } from './_placeholder';

export function OrgSettingsScreen(props: OrgSettingsScreenProps) {
  const [v, setV] = useState(props.values);
  useEffect(() => setV(props.values), [props.values]);
  const unitSelect = (k: keyof typeof v.units, label: string) => (
    <label>
      {label}
      <select disabled={!props.canEdit} value={v.units[k]} onChange={(e) => setV({ ...v, units: { ...v.units, [k]: e.target.value } })}>
        {props.options[k].map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
  return (
    <AsyncFrame state={props}>
      <h1>Organization settings</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          props.onSave(v);
        }}
      >
        <label>Name <input disabled={!props.canEdit} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></label>
        <label>
          Time zone
          <select disabled={!props.canEdit} value={v.timezone} onChange={(e) => setV({ ...v, timezone: e.target.value })}>
            {props.options.timezones.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        {unitSelect('length', 'Length')}
        {unitSelect('speed', 'Speed')}
        {unitSelect('mass', 'Mass')}
        {unitSelect('temperature', 'Temperature')}
        {props.canEdit && <button type="submit" disabled={props.saving}>{props.saving ? 'Saving…' : 'Save'}</button>}
      </form>
    </AsyncFrame>
  );
}
