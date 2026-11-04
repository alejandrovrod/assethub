// session-state.ts — Session state machine for offline operation
// States: ACTIVE → OFFLINE_LEASE → OFFLINE_READONLY → FROZEN → LOCKED → WIPED

export type SessionState =
  | 'ACTIVE'
  | 'OFFLINE_LEASE'
  | 'OFFLINE_READONLY'
  | 'FROZEN'
  | 'LOCKED'
  | 'WIPED';

export type SessionEvent =
  | 'GO_OFFLINE'
  | 'LEASE_EXPIRED'
  | 'LEASE_VALID'
  | 'CONNECTION_RESTORED'
  | 'PIN_REQUIRED'
  | 'PIN_VERIFIED'
  | 'PIN_FAILED_MAX'
  | 'LOGOUT'
  | 'WIPE';

const TRANSITIONS: Record<SessionState, Partial<Record<SessionEvent, SessionState>>> = {
  ACTIVE: {
    GO_OFFLINE: 'OFFLINE_LEASE',
    CONNECTION_RESTORED: 'ACTIVE',
    LOGOUT: 'WIPED',
    WIPE: 'WIPED',
  },
  OFFLINE_LEASE: {
    LEASE_EXPIRED: 'OFFLINE_READONLY',
    CONNECTION_RESTORED: 'ACTIVE',
    PIN_REQUIRED: 'LOCKED',
    LOGOUT: 'WIPED',
    WIPE: 'WIPED',
  },
  OFFLINE_READONLY: {
    LEASE_VALID: 'OFFLINE_LEASE',
    CONNECTION_RESTORED: 'ACTIVE',
    PIN_REQUIRED: 'LOCKED',
    LOGOUT: 'WIPED',
    WIPE: 'WIPED',
  },
  FROZEN: {
    CONNECTION_RESTORED: 'ACTIVE',
    LOGOUT: 'WIPED',
    WIPE: 'WIPED',
  },
  LOCKED: {
    PIN_VERIFIED: 'ACTIVE',
    PIN_FAILED_MAX: 'WIPED',
    LOGOUT: 'WIPED',
    WIPE: 'WIPED',
  },
  WIPED: {},
};

export class SessionStateMachine {
  private state: SessionState;
  private listeners: Array<(state: SessionState) => void> = [];

  constructor(initial: SessionState = 'ACTIVE') {
    this.state = initial;
  }

  getState(): SessionState {
    return this.state;
  }

  canTransition(event: SessionEvent): boolean {
    return TRANSITIONS[this.state]?.[event] !== undefined;
  }

  transition(event: SessionEvent): SessionState {
    const next = TRANSITIONS[this.state]?.[event];
    if (!next) {
      throw new Error(`Invalid transition: ${this.state} --${event}--> (none)`);
    }
    this.state = next;
    this.listeners.forEach((cb) => cb(this.state));
    return this.state;
  }

  onStateChange(cb: (state: SessionState) => void): () => void {
    this.listeners.push(cb);
    return () => {
      const idx = this.listeners.indexOf(cb);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  isOperational(): boolean {
    return this.state === 'ACTIVE' || this.state === 'OFFLINE_LEASE';
  }

  isReadOnly(): boolean {
    return this.state === 'OFFLINE_READONLY' || this.state === 'FROZEN';
  }

  isLocked(): boolean {
    return this.state === 'LOCKED';
  }

  isWiped(): boolean {
    return this.state === 'WIPED';
  }
}
