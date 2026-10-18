'use client';

import type { ArgusFlightViewModel } from '@certa/contract';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Select } from '@/components/ui/field';

/**
 * Pick the drone flown on an Argus mission flight, which makes it a regular Certa flight (aircraft
 * hours and maintenance count it too), or dismiss it when the job had no flight.
 */
export function ArgusFlightDialog({
  flight,
  aircraftOptions,
  onClose,
  onConvert,
  onDismiss,
}: {
  flight: ArgusFlightViewModel | undefined;
  aircraftOptions: { value: string; label: string }[];
  onClose: () => void;
  onConvert: (aircraftId: string) => void;
  onDismiss: () => void;
}) {
  const [aircraftId, setAircraftId] = useState('');
  const close = () => (setAircraftId(''), onClose());
  return (
    <Dialog
      open={!!flight}
      onClose={close}
      title={flight?.reference ?? 'Argus flight'}
      description={flight && [flight.date.display, flight.flightTime.display, flight.location].filter(Boolean).join(' · ')}
      footer={
        <>
          <Button variant="danger" onClick={() => (onDismiss(), close())}>Not a flight</Button>
          <span className="flex-1" />
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button type="submit" form="argus-flight-form" arrow disabled={!aircraftId}>Add to logbook</Button>
        </>
      }
    >
      <form
        id="argus-flight-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!aircraftId) return;
          onConvert(aircraftId);
          close();
        }}
      >
        <p className="text-[14px] text-[var(--certa-muted)]">This flight already counts toward your flight time. Pick the drone you flew so it also counts toward that aircraft’s hours and maintenance.</p>
        {aircraftOptions.length ? (
          <Field label="Drone">
            {(a) => (
              <Select {...a} required value={aircraftId} onChange={(e) => setAircraftId(e.target.value)}>
                <option value="" disabled>Choose a drone</option>
                {aircraftOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            )}
          </Field>
        ) : (
          <p className="text-[14px]">Add the drone under Aircraft first, then come back to pick it.</p>
        )}
      </form>
    </Dialog>
  );
}
