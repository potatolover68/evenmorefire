import { emptySession, type PageJob, type Session } from "./types.ts";

const DB_NAME = "emf";
const STORE = "sessions";
const BODIES = "bodies";
const writtenBodies = new WeakMap<PageJob, string>();

export interface SessionDepot {
  getSession(key: string): Promise<Session | undefined>;
  putSession(session: Session): Promise<void>;
  getBody(key: string): Promise<string | undefined>;
  putBody(key: string, content: string): Promise<void>;
  deleteSession(key: string): Promise<void>;
  deleteBodies(sessionKey: string): Promise<void>;
}

export function bodyStorageKey(sessionKey: string, title: string): string {
  return `${sessionKey}\0${title}`;
}

/** Session record stored without proposal wikitext. */
export function sessionForStorage(session: Session): Session {
  const jobs: Session["jobs"] = {};
  for (const [title, job] of Object.entries(session.jobs)) {
    jobs[title] = job.content == null ? job : { ...job, content: null };
  }
  return { ...session, jobs };
}

export async function saveSessionTo(
  depot: SessionDepot,
  session: Session,
  written: WeakMap<PageJob, string> = writtenBodies,
): Promise<void> {
  for (const job of Object.values(session.jobs)) {
    if (job.content == null) continue;
    if (written.get(job) === job.content) continue;
    await depot.putBody(bodyStorageKey(session.key, job.title), job.content);
    written.set(job, job.content);
  }
  await depot.putSession(sessionForStorage(session));
}

export async function loadSessionFrom(
  depot: SessionDepot,
  key: string,
): Promise<Session | null> {
  const value = await depot.getSession(key);
  if (!value) return null;
  return { ...emptySession(key), ...value, key };
}

export async function loadBodyFrom(
  depot: SessionDepot,
  sessionKey: string,
  title: string,
): Promise<string | null> {
  const value = await depot.getBody(bodyStorageKey(sessionKey, title));
  return typeof value === "string" ? value : null;
}

export function releaseIdleContentFrom(
  session: Session,
  openTitle: string | null,
  written: WeakMap<PageJob, string> = writtenBodies,
): void {
  for (const job of Object.values(session.jobs)) {
    if (openTitle != null && job.title === openTitle) continue;
    if (job.content == null) continue;
    if (written.get(job) !== job.content) continue;
    job.content = null;
  }
}

export function releaseIdleContent(
  session: Session,
  openTitle: string | null,
): void {
  releaseIdleContentFrom(session, openTitle);
}

export async function loadJobContent(
  sessionKey: string,
  title: string,
): Promise<string | null> {
  return loadBodyFrom(idbDepot(), sessionKey, title);
}

export async function saveRecord(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  await requestDone(
    db.transaction(STORE, "readwrite").objectStore(STORE).put(value, key),
  );
}

export async function loadRecord<T>(key: string): Promise<T | null> {
  const db = await openDb();
  const value = await requestResult<T | undefined>(
    db.transaction(STORE).objectStore(STORE).get(key),
  );
  return value ?? null;
}

export async function loadSession(key: string): Promise<Session | null> {
  return loadSessionFrom(idbDepot(), key);
}

export async function saveSession(session: Session): Promise<void> {
  await saveSessionTo(idbDepot(), session);
}

export async function deleteSession(key: string): Promise<void> {
  const depot = idbDepot();
  await depot.deleteSession(key);
  await depot.deleteBodies(key);
}

function idbDepot(): SessionDepot {
  return {
    async getSession(key) {
      const db = await openDb();
      return requestResult<Session | undefined>(
        db.transaction(STORE).objectStore(STORE).get(key),
      );
    },
    async putSession(session) {
      const db = await openDb();
      await requestDone(
        db
          .transaction(STORE, "readwrite")
          .objectStore(STORE)
          .put(session, session.key),
      );
    },
    async getBody(key) {
      const db = await openDb();
      return requestResult<string | undefined>(
        db.transaction(BODIES).objectStore(BODIES).get(key),
      );
    },
    async putBody(key, content) {
      const db = await openDb();
      await requestDone(
        db
          .transaction(BODIES, "readwrite")
          .objectStore(BODIES)
          .put(content, key),
      );
    },
    async deleteSession(key) {
      const db = await openDb();
      await requestDone(
        db.transaction(STORE, "readwrite").objectStore(STORE).delete(key),
      );
    },
    async deleteBodies(sessionKey) {
      const db = await openDb();
      const prefix = `${sessionKey}\0`;
      await new Promise<void>((resolve, reject) => {
        const store = db.transaction(BODIES, "readwrite").objectStore(BODIES);
        const request = store.openCursor(
          IDBKeyRange.bound(prefix, `${prefix}\uffff`),
        );
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) {
            resolve();
            return;
          }
          cursor.delete();
          cursor.continue();
        };
      });
    },
  };
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestDone(request: IDBRequest): Promise<void> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(BODIES)) db.createObjectStore(BODIES);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
