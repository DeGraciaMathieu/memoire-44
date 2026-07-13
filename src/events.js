// Bus d'événements minimaliste : le SEUL canal règles → rendu.

export function createBus() {
  const handlers = {};
  return {
    on(event, fn) {
      (handlers[event] ??= []).push(fn);
      return () => {
        handlers[event] = handlers[event].filter((h) => h !== fn);
      };
    },
    emit(event, payload) {
      for (const fn of handlers[event] ?? []) fn(payload);
    },
  };
}
