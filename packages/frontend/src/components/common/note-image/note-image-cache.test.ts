import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NoteImageCache } from "./note-image-cache.js";

const BLOB_URL = "blob:cat";
const NOTE_ID = "cat.png";

const createObjectURL = vi.fn(() => BLOB_URL);
const revokeObjectURL = vi.fn();
const fetchImage = vi.fn(() => Promise.resolve(new Blob()));

async function loadImageUrl(): Promise<string> {
  return URL.createObjectURL(await fetchImage());
}

/** Lets every settled load's follow-up run. */
function flushLoads(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}

beforeEach(() => {
  vi.spyOn(URL, "createObjectURL").mockImplementation(createObjectURL);
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(revokeObjectURL);
});

afterEach(() => {
  vi.restoreAllMocks();
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  fetchImage.mockClear();
});

describe("NoteImageCache", () => {
  it("shares one load and keeps the URL while another user still holds it", async () => {
    const cache = new NoteImageCache(loadImageUrl);

    await expect(cache.acquire(NOTE_ID)).resolves.toBe(BLOB_URL);
    await expect(cache.acquire(NOTE_ID)).resolves.toBe(BLOB_URL);
    cache.release(NOTE_ID);
    await flushLoads();

    expect(fetchImage).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it("revokes the URL once the last user releases it", async () => {
    const cache = new NoteImageCache(loadImageUrl);

    await cache.acquire(NOTE_ID);
    await cache.acquire(NOTE_ID);
    cache.release(NOTE_ID);
    cache.release(NOTE_ID);
    await flushLoads();

    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith(BLOB_URL);
  });

  it("revokes a URL released before its load resolved, once it resolves", async () => {
    const { promise, resolve } = Promise.withResolvers<Blob>();
    fetchImage.mockReturnValueOnce(promise);
    const cache = new NoteImageCache(loadImageUrl);

    void cache.acquire(NOTE_ID);
    cache.release(NOTE_ID);
    await flushLoads();

    expect(revokeObjectURL).not.toHaveBeenCalled();

    resolve(new Blob());
    await flushLoads();

    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith(BLOB_URL);
  });
});
