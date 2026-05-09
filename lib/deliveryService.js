// Delivery service abstraction layer.
// Today: manual dispatch (staff types order info into Wolt/Bolt merchant app).
// Tomorrow: drop-in real API integrations behind these same function signatures.

export const PROVIDERS = {
  in_house: { id: 'in_house', label: 'In-house', color: '#16a34a', tracking_supported: false },
  wolt: { id: 'wolt', label: 'Wolt', color: '#00C2E8', tracking_supported: false }, // wolt-blue
  bolt_food: { id: 'bolt_food', label: 'Bolt Food', color: '#34D186', tracking_supported: false }, // bolt-green
}

export function isValidProvider(p) {
  return ['in_house', 'wolt', 'bolt_food'].includes(p)
}

// --- Future API hooks (stubs return manual=true today) ---

export async function createCourierRequest(provider, order) {
  // TODO: when Wolt/Bolt grant merchant API access, POST the order here and
  // return { ok, courier_reference_id, tracking_url, courier_eta }.
  // Today, staff manually creates the request in the merchant app.
  return {
    ok: true,
    manual: true,
    provider,
    courier_reference_id: null,
    tracking_url: null,
    courier_eta: null,
  }
}

export async function updateCourierStatus(order) {
  // TODO: pull latest status from Wolt/Bolt webhook or polling endpoint.
  return { manual: true, status: order.delivery_status || 'pending' }
}

export async function getCourierTracking(order) {
  return {
    provider: order.delivery_provider || null,
    tracking_url: order.courier_tracking_url || null,
    eta_minutes: order.courier_eta || null,
    manual: true,
  }
}
