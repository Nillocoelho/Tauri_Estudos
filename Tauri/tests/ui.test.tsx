// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { HashRouter } from "react-router-dom";
import { App } from "../src/app/App";
import { useApp } from "../src/app/store";
afterEach(cleanup);
describe("estado de banco indisponível", () => {
  it("explica o erro e oferece nova tentativa", async () => {
    useApp.setState({
      data: null,
      error: "Banco indisponível",
      load: vi.fn(async () => {}),
    });
    render(
      <HashRouter>
        <App />
      </HashRouter>,
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "Banco indisponível",
    );
    expect(
      screen.getByRole("button", { name: "Tentar novamente" }),
    ).toBeTruthy();
  });
});
