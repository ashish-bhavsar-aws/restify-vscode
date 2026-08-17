import { describe, it, expect } from "vitest";
import { matchPath, matchRoute, type MockRoute } from "../../src/core/mockServer";

describe("matchPath", () => {
  it("matches exact paths", () => {
    expect(matchPath("/users", "/users")).toEqual({});
    expect(matchPath("/api/users", "/api/users")).toEqual({});
  });

  it("rejects paths with different lengths", () => {
    expect(matchPath("/users", "/users/123")).toBeNull();
    expect(matchPath("/users/{id}", "/users")).toBeNull();
  });

  it("rejects paths with different segments", () => {
    expect(matchPath("/users", "/posts")).toBeNull();
    expect(matchPath("/api/users", "/api/posts")).toBeNull();
  });

  it("extracts single path parameters", () => {
    expect(matchPath("/users/{id}", "/users/123")).toEqual({ id: "123" });
    expect(matchPath("/pets/{petId}", "/pets/abc")).toEqual({ petId: "abc" });
  });

  it("extracts multiple path parameters", () => {
    expect(matchPath("/users/{userId}/posts/{postId}", "/users/42/posts/7"))
      .toEqual({ userId: "42", postId: "7" });
  });

  it("handles URI-encoded path parameters", () => {
    expect(matchPath("/files/{name}", "/files/hello%20world"))
      .toEqual({ name: "hello world" });
  });

  it("matches root path", () => {
    expect(matchPath("/", "/")).toEqual({});
  });

  it("handles trailing slashes consistently", () => {
    expect(matchPath("/users", "/users")).toEqual({});
  });
});

describe("matchRoute", () => {
  const routes: MockRoute[] = [
    { method: "GET", path: "/users", statusCode: 200, headers: {}, body: "[]" },
    { method: "GET", path: "/users/{id}", statusCode: 200, headers: {}, body: "{}" },
    { method: "POST", path: "/users", statusCode: 201, headers: {}, body: "{}" },
    { method: "DELETE", path: "/users/{id}", statusCode: 204, headers: {}, body: "" },
  ];

  it("matches by method and path", () => {
    const match = matchRoute(routes, "GET", "/users");
    expect(match).not.toBeNull();
    expect(match!.route.statusCode).toBe(200);
  });

  it("matches with path parameters", () => {
    const match = matchRoute(routes, "GET", "/users/42");
    expect(match).not.toBeNull();
    expect(match!.params).toEqual({ id: "42" });
    expect(match!.route.statusCode).toBe(200);
  });

  it("matches POST to collection endpoint", () => {
    const match = matchRoute(routes, "POST", "/users");
    expect(match).not.toBeNull();
    expect(match!.route.statusCode).toBe(201);
  });

  it("matches DELETE with path param", () => {
    const match = matchRoute(routes, "DELETE", "/users/99");
    expect(match).not.toBeNull();
    expect(match!.route.statusCode).toBe(204);
    expect(match!.params).toEqual({ id: "99" });
  });

  it("returns null for unmatched method", () => {
    expect(matchRoute(routes, "PATCH", "/users")).toBeNull();
  });

  it("returns null for unmatched path", () => {
    expect(matchRoute(routes, "GET", "/nonexistent")).toBeNull();
  });

  it("is case-sensitive on path", () => {
    expect(matchRoute(routes, "GET", "/Users")).toBeNull();
  });

  it("is case-insensitive on method", () => {
    const match = matchRoute(routes, "get", "/users");
    expect(match).not.toBeNull();
  });
});
