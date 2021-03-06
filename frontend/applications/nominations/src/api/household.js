import { get, post, put, delete_ } from '../lib/apiService';
// import type { DataTableResponse } from 'lib/apiService';

// export type HouseholdType = {
//   id: number,
//   children: Object[],
//   firstName: string,
//   nominator: Object,
//   surname: string,
//   phoneNumbers: Object[],
//   address: Object,
//   attachments: Object[]
// };

export function getHousehold(householdId) {
  return get('nominations', `households/${householdId}`);
}

export function getHouseholdList(pageNumber = 1, search) {
  return get('nominations', 'households', { page: pageNumber, search: search });
}

export function createHousehold(json) {
  return post('nominations', 'households', json);
}

export function updateHousehold(id, json) {
  return put('nominations', `households/${id}`, json);
}

export function submitNomination({ id }) {
  return put('nominations', `households/${id}/submit`, { id });
}

export function uploadAttachment({ id, file }) {
  const formData = new FormData();
  formData.append('file', file[0]);
  return post('nominations', `households/${id}/upload`, formData);
}

export function reviewHousehold(id, payload) {
  const { approved, reason, message } = payload;
  return put('nominations', `households/${id}/feedback`, {
    approved,
    reason,
    message
  });
}

export function getNominationStatus() {
  return get('nominations', 'users/me/status');
}

export function deleteNomination(id) {
  return delete_('nominations', `households/${id}`);
}
