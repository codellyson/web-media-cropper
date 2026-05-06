import { registerSW } from 'virtual:pwa-register'

if (import.meta.env.DEV) {
	// Avoid stale cached bundles while iterating on interaction-heavy UI.
	void navigator.serviceWorker?.getRegistrations?.().then((registrations) => {
		for (const registration of registrations) {
			void registration.unregister()
		}
	})
} else {
	registerSW({ immediate: true })
}
