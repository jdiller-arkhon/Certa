import type { ChecklistTemplate } from '../domain/entities.js';

type Sections = ChecklistTemplate['sections'];

/**
 * The pre-flight checklist an org starts with. Generic small-UAS items drawn from common
 * operator practice; every org can edit it. Item ids are stable so runs stay readable after
 * the template changes.
 */
export const DEFAULT_PREFLIGHT_SECTIONS: Sections = [
  {
    id: 'site',
    title: 'Site and airspace',
    items: [
      { id: 'airspace', text: 'Airspace checked; authorization on hand if required', required: true, photoRequired: false },
      { id: 'tfr', text: 'No TFRs or NOTAMs affecting the operation', required: true, photoRequired: false },
      { id: 'weather', text: 'Weather within limits (wind, visibility, ceiling)', required: true, photoRequired: false },
      { id: 'hazards', text: 'Launch area clear; people and obstacles briefed', required: true, photoRequired: false },
    ],
  },
  {
    id: 'aircraft',
    title: 'Aircraft',
    items: [
      { id: 'props', text: 'Propellers secure, no nicks or cracks', required: true, photoRequired: false },
      { id: 'airframe', text: 'Arms locked, airframe and gimbal undamaged', required: true, photoRequired: false },
      { id: 'battery', text: 'Battery charged, seated, and latched', required: true, photoRequired: false },
      { id: 'remote_id', text: 'Remote ID broadcasting', required: true, photoRequired: false },
      { id: 'media', text: 'Storage card inserted with space', required: false, photoRequired: false },
    ],
  },
  {
    id: 'controls',
    title: 'Controls and link',
    items: [
      { id: 'controller', text: 'Controller charged; link and video strong', required: true, photoRequired: false },
      { id: 'gnss', text: 'GNSS lock; home point recorded', required: true, photoRequired: false },
      { id: 'rth', text: 'Return-to-home altitude and failsafe set', required: true, photoRequired: false },
      { id: 'compass', text: 'Compass and IMU healthy, no warnings', required: true, photoRequired: false },
    ],
  },
];

/** True when every required item has a checked response. */
export function checklistComplete(sections: Sections, responses: { itemId: string; checked: boolean }[]): boolean {
  const done = new Set(responses.filter((r) => r.checked).map((r) => r.itemId));
  return sections.every((s) => s.items.every((i) => !i.required || done.has(i.id)));
}
