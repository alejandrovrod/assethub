import { describe, it, expect } from 'vitest';
import {
  ASSIGNEE_PROPERTY_KEYS,
  FOLLOW_UP_PROPERTY_KEYS,
  matchesActorInProperties,
  parseProperties,
  resolveAssigneeId,
  resolveAssigneeIds,
  resolveFollowUpIds,
} from './assignment';

// Real values from tenant data: the executor lives in propertiesJson, not in AssignedEmployeeId.
const ALEJANDRO = '848c1db9-5844-4f19-889e-6229b0db5d2e';
const MICHAEL = 'adcdf4de-88f2-47ed-a362-5d226f1704ad';
const ASSET = '6bbec714-67cd-4091-bc35-2f6a15d04407';

describe('assignment — asignar_a is the executor, reportar_a is follow-up', () => {
  it('reads the executor from asignar_a', () => {
    const props = JSON.stringify({ asignar_a: MICHAEL, field_1786753693545: ASSET });
    expect(resolveAssigneeId(props)).toBe(MICHAEL);
  });

  it('supports the legacy asignado_a spelling', () => {
    expect(resolveAssigneeId(JSON.stringify({ asignado_a: MICHAEL }))).toBe(MICHAEL);
  });

  it('does NOT treat reportar_a as an assignment', () => {
    const props = JSON.stringify({ reportar_a: ALEJANDRO, field_1786753693545: ASSET });
    expect(resolveAssigneeId(props)).toBeUndefined();
    expect(resolveAssigneeIds(props)).toEqual([]);
  });

  it('does NOT treat reportado_a or recibe_a as an assignment', () => {
    expect(resolveAssigneeId(JSON.stringify({ reportado_a: ALEJANDRO }))).toBeUndefined();
    expect(resolveAssigneeId(JSON.stringify({ recibe_a: ALEJANDRO }))).toBeUndefined();
  });

  it('exposes the follow-up ids separately', () => {
    const props = JSON.stringify({ reportar_a: ALEJANDRO, reportado_a: MICHAEL });
    expect(resolveFollowUpIds(props)).toEqual([ALEJANDRO, MICHAEL]);
    expect(resolveAssigneeId(props)).toBeUndefined();
  });

  it('keeps both roles apart when a task declares them', () => {
    const props = JSON.stringify({ reportar_a: ALEJANDRO, asignar_a: MICHAEL });
    expect(resolveAssigneeId(props)).toBe(MICHAEL);
    expect(resolveFollowUpIds(props)).toEqual([ALEJANDRO]);
  });

  it('reads array-valued executor fields', () => {
    expect(resolveAssigneeIds(JSON.stringify({ asignar_a: [MICHAEL, ALEJANDRO] }))).toEqual([
      MICHAEL,
      ALEJANDRO,
    ]);
  });

  it('returns undefined when no executor key is declared', () => {
    expect(resolveAssigneeId(JSON.stringify({ field_1786753693545: ASSET }))).toBeUndefined();
  });

  it('survives malformed properties instead of throwing', () => {
    expect(parseProperties('.')).toBeUndefined();
    expect(parseProperties('{not json')).toBeUndefined();
    expect(parseProperties('')).toBeUndefined();
    expect(resolveAssigneeId('.')).toBeUndefined();
    expect(resolveAssigneeIds('{not json')).toEqual([]);
    expect(resolveFollowUpIds('{not json')).toEqual([]);
  });

  it('ignores blank values so an empty field does not shadow a later key', () => {
    expect(resolveAssigneeId(JSON.stringify({ asignar_a: '   ', asignado_a: ALEJANDRO }))).toBe(
      ALEJANDRO,
    );
  });

  it('declares the two roles with disjoint key sets', () => {
    expect(ASSIGNEE_PROPERTY_KEYS).toContain('asignar_a');
    expect(FOLLOW_UP_PROPERTY_KEYS).toContain('reportar_a');
    const overlap = ASSIGNEE_PROPERTY_KEYS.filter((key) =>
      (FOLLOW_UP_PROPERTY_KEYS as readonly string[]).includes(key),
    );
    expect(overlap).toEqual([]);
  });
});

describe('matchesActorInProperties — only the executor matches', () => {
  it('matches the actor declared in asignar_a', () => {
    const props = JSON.stringify({ asignar_a: ALEJANDRO, field_1786753693545: ASSET });
    expect(matchesActorInProperties(props, [ALEJANDRO])).toBe(true);
    expect(matchesActorInProperties(props, [MICHAEL])).toBe(false);
  });

  it('does not match the actor when they only follow up', () => {
    const props = JSON.stringify({ reportar_a: ALEJANDRO });
    expect(matchesActorInProperties(props, [ALEJANDRO])).toBe(false);
  });

  it('does not match the actor on unrelated custom employee fields', () => {
    // Only asignar_a assigns work. Other fields (reporter, supervisor, custom employee pickers)
    // must not pull other people's tasks into the technician's jornada.
    const props = JSON.stringify({ field_1787210991483_f6zrojsj8: ALEJANDRO });
    expect(matchesActorInProperties(props, [ALEJANDRO])).toBe(false);
  });

  it('is case-insensitive', () => {
    const props = JSON.stringify({ asignar_a: ALEJANDRO.toUpperCase() });
    expect(matchesActorInProperties(props, [ALEJANDRO])).toBe(true);
  });

  it('matches inside arrays', () => {
    const props = JSON.stringify({ asignar_a: [ASSET, MICHAEL] });
    expect(matchesActorInProperties(props, [MICHAEL])).toBe(true);
  });

  it('does not match when the actor ids are unknown', () => {
    const props = JSON.stringify({ asignar_a: ALEJANDRO });
    expect(matchesActorInProperties(props, [])).toBe(false);
    expect(matchesActorInProperties(props, [undefined])).toBe(false);
    expect(matchesActorInProperties(props, [undefined, undefined])).toBe(false);
  });

  it('does not match unrelated values that share the actor id as a substring', () => {
    const props = JSON.stringify({ asignar_a: `${ALEJANDRO}-suffix` });
    expect(matchesActorInProperties(props, [ALEJANDRO])).toBe(false);
  });

  it('does not throw on malformed properties', () => {
    expect(matchesActorInProperties('.', [ALEJANDRO])).toBe(false);
  });
});
