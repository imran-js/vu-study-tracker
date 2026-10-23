import type { CalendarEventBody } from "../domain/calendar";

const root = "https://www.googleapis.com/calendar/v3";
const scopeRoot = "https://www.googleapis.com/auth/";
export const calendarScopes = {
  list: scopeRoot + "calendar.calendarlist.readonly",
  owned: scopeRoot + "calendar.events.owned",
  create: scopeRoot + "calendar.app.created",
};
type TokenResponse = {
  access_token: string;
  expires_in: number;
  error?: string;
};
type OAuth = {
  initTokenClient(options: {
    client_id: string;
    scope: string;
    include_granted_scopes: boolean;
    callback: (r: TokenResponse) => void;
    error_callback: () => void;
  }): { requestAccessToken(options: { prompt: string }): void };
  hasGrantedAllScopes(r: TokenResponse, ...scopes: string[]): boolean;
  revoke(token: string, callback: () => void): void;
};
declare global {
  interface Window {
    google?: { accounts: { oauth2: OAuth } };
  }
}
let scriptPromise: Promise<void> | undefined;
export function loadGoogleIdentity() {
  if (window.google?.accounts.oauth2) return Promise.resolve();
  return (scriptPromise ||= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    const fail = () => {
      script.remove();
      scriptPromise = undefined;
      reject(
        new Error(
          "Google authorization could not load. Check your connection and retry.",
        ),
      );
    };
    const timeout = setTimeout(fail, 15000);
    script.onload = () => {
      clearTimeout(timeout);
      resolve();
    };
    script.onerror = () => {
      clearTimeout(timeout);
      fail();
    };
    document.head.append(script);
  }));
}
export type GoogleCalendar = {
  id: string;
  summary: string;
  accessRole: string;
  primary?: boolean;
};
type RemoteEvent = {
  id: string;
  status?: string;
  extendedProperties?: CalendarEventBody["extendedProperties"];
};
export class CalendarApiError extends Error {
  constructor(public status: number) {
    super(
      status === 401
        ? "Calendar authorization expired. Connect again."
        : status === 403
          ? "Calendar access denied. Check permissions and API setup."
          : status === 404 || status === 410
            ? "External event or calendar is missing. Your academic records are unchanged."
            : status === 429
              ? "Calendar rate limit reached. Retry later."
              : "Google Calendar request failed. Retry sync; study data is safe.",
    );
  }
}
export interface CalendarGateway {
  upsert(
    calendarId: string,
    eventId: string,
    body: CalendarEventBody,
  ): Promise<void>;
  remove(
    calendarId: string,
    eventId: string,
    assessmentId: string,
  ): Promise<void>;
}
export class GoogleCalendarClient implements CalendarGateway {
  private token?: string;
  private expiry = 0;
  private epoch = 0;
  private cancelAuthorization?: () => void;
  private controllers = new Set<AbortController>();
  get connected() {
    return !!this.token && Date.now() < this.expiry;
  }
  async connect(clientId: string, creation = false) {
    if (!clientId)
      throw new Error(
        "Google Calendar setup is required: configure VITE_GOOGLE_CALENDAR_CLIENT_ID.",
      );
    const epoch = ++this.epoch;
    await loadGoogleIdentity();
    if (epoch !== this.epoch) throw new Error("Calendar connection cancelled.");
    const scopes = [
      calendarScopes.list,
      calendarScopes.owned,
      ...(creation ? [calendarScopes.create] : []),
    ];
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.cancelAuthorization = undefined;
        if (error) reject(error);
        else resolve();
      };
      const timeout = setTimeout(() => {
        this.epoch++;
        finish(
          new Error(
            "Google sign-in timed out. Retry in Chrome or Edge with popups allowed.",
          ),
        );
      }, 180000);
      this.cancelAuthorization = () =>
        finish(new Error("Calendar connection cancelled."));
      const oauth = window.google!.accounts.oauth2;
      const client = oauth.initTokenClient({
        client_id: clientId,
        scope: scopes.join(" "),
        include_granted_scopes: true,
        callback: (r) => {
          if (epoch !== this.epoch) {
            finish(new Error("Calendar connection cancelled."));
            return;
          }
          if (r.error || !oauth.hasGrantedAllScopes(r, ...scopes)) {
            finish(
              new Error("Required Calendar permissions were not granted."),
            );
            return;
          }
          this.token = r.access_token;
          this.expiry = Date.now() + Number(r.expires_in) * 1000 - 30000;
          finish();
        },
        error_callback: () =>
          finish(
            new Error(
              "Google connection was cancelled or the popup was blocked.",
            ),
          ),
      });
      client.requestAccessToken({
        prompt: creation && this.connected ? "" : "select_account",
      });
    });
  }
  disconnect(revoke = true) {
    const token = this.token;
    this.token = undefined;
    this.expiry = 0;
    this.epoch++;
    this.cancelAuthorization?.();
    this.controllers.forEach((c) => c.abort());
    this.controllers.clear();
    if (token && revoke) window.google?.accounts.oauth2.revoke(token, () => {});
  }
  private async request<T>(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<T> {
    if (!this.connected) throw new CalendarApiError(401);
    const controller = new AbortController();
    this.controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(root + path, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
      if (!response.ok) {
        if (response.status === 401) this.disconnect(false);
        throw new CalendarApiError(response.status);
      }
      return response.status === 204
        ? (undefined as T)
        : ((await response.json()) as T);
    } catch (e) {
      if (e instanceof CalendarApiError) throw e;
      throw new Error(
        "Calendar connection interrupted. Retry sync; study data is safe.",
      );
    } finally {
      clearTimeout(timeout);
      this.controllers.delete(controller);
    }
  }
  async calendars() {
    const items: GoogleCalendar[] = [];
    let page: string | undefined;
    do {
      const result: { items?: GoogleCalendar[]; nextPageToken?: string } =
        await this.request(
          `/users/me/calendarList?minAccessRole=owner&maxResults=250${page ? `&pageToken=${encodeURIComponent(page)}` : ""}`,
        );
      items.push(
        ...(result.items || []).filter((c) => c.accessRole === "owner"),
      );
      page = result.nextPageToken;
    } while (page);
    return items;
  }
  async createCalendar(summary: string, timeZone: string) {
    return this.request<GoogleCalendar>("/calendars", "POST", {
      summary,
      timeZone,
    });
  }
  private owned(event: RemoteEvent, assessmentId: string) {
    if (event.status === "cancelled") throw new CalendarApiError(410);
    if (
      event.extendedProperties?.private?.application !== "vu-study-desk" ||
      event.extendedProperties.private.assessmentId !== assessmentId
    )
      throw new Error(
        "This Google event is not a matching Study Desk event. It was left unchanged.",
      );
  }
  async upsert(calendarId: string, eventId: string, body: CalendarEventBody) {
    const base = `/calendars/${encodeURIComponent(calendarId)}/events`,
      path = `${base}/${encodeURIComponent(eventId)}`;
    try {
      const event = await this.request<RemoteEvent>(path);
      this.owned(event, body.extendedProperties.private.assessmentId);
    } catch (e) {
      if (!(e instanceof CalendarApiError) || e.status !== 404) throw e;
      try {
        await this.request(base, "POST", { id: eventId, ...body });
        return;
      } catch (e) {
        if (!(e instanceof CalendarApiError) || e.status !== 409) throw e;
      }
      this.owned(
        await this.request<RemoteEvent>(path),
        body.extendedProperties.private.assessmentId,
      );
    }
    await this.request(path, "PATCH", body);
  }
  async remove(calendarId: string, eventId: string, assessmentId: string) {
    const path = `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
    try {
      this.owned(await this.request<RemoteEvent>(path), assessmentId);
      await this.request(path, "DELETE");
    } catch (e) {
      if (!(e instanceof CalendarApiError) || ![404, 410].includes(e.status))
        throw e;
    }
  }
}
export function googleEventUrl(calendarId: string, eventId: string) {
  const bytes = new TextEncoder().encode(`${eventId} ${calendarId}`);
  return `https://calendar.google.com/calendar/event?eid=${encodeURIComponent(btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join("")))}`;
}
