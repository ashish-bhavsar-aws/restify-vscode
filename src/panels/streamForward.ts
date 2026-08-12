/**
 * F28 — forwards event-stream chunks from the request engine to the webview.
 *
 * Decodes UTF-8 incrementally so multi-byte characters split across network
 * chunks don't render as replacement glyphs while the stream is in flight.
 */
import { StringDecoder } from "string_decoder";
import type { StreamEvent } from "../core";

export function createStreamForwarder(
  tabId: string,
  post: (message: any) => void,
): (event: StreamEvent) => void {
  const decoder = new StringDecoder("utf8");
  return (event) => {
    try {
      if (event.chunk) {
        post({
          command: "streamChunk",
          tabId,
          chunk: decoder.write(event.chunk),
          size: event.chunk.length,
        });
      } else {
        post({
          command: "streamStart",
          tabId,
          status: event.status,
          statusText: event.statusText,
          headers: event.headers,
        });
      }
    } catch {
      /* panel disposed */
    }
  };
}
