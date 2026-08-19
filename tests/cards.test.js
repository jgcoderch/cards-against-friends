import { describe, it, expect } from "vitest";
import { DECKS, DECK_LIST } from "../server/cards.js";

describe("baralhos", () => {
  it("tem os dois modos registrados com metadados coerentes", () => {
    expect(Object.keys(DECKS).sort()).toEqual(["cancelavel", "casual"]);
    expect(DECKS.casual.mature).toBe(false);
    expect(DECKS.cancelavel.mature).toBe(true);
  });

  it("DECK_LIST espelha DECKS só com os metadados públicos (não vaza o conteúdo)", () => {
    expect(DECK_LIST).toHaveLength(Object.keys(DECKS).length);
    for (const meta of DECK_LIST) {
      const deck = DECKS[meta.id];
      expect(deck).toBeDefined();
      expect(meta.name).toBe(deck.name);
      expect(meta.description).toBe(deck.description);
      expect(meta.mature).toBe(deck.mature);
      expect(meta.black).toBeUndefined();
      expect(meta.white).toBeUndefined();
    }
  });

  it("cada baralho tem cartas pretas e brancas não vazias e sem duplicatas", () => {
    for (const deck of Object.values(DECKS)) {
      expect(deck.black.length).toBeGreaterThan(0);
      expect(deck.white.length).toBeGreaterThan(0);

      for (const text of [...deck.black, ...deck.white]) {
        expect(typeof text).toBe("string");
        expect(text.trim().length).toBeGreaterThan(0);
      }

      expect(new Set(deck.black).size).toBe(deck.black.length);
      expect(new Set(deck.white).size).toBe(deck.white.length);
    }
  });

  it("o baralho oficial (Cancelável) tem o tamanho esperado do material original (Pick 1 só)", () => {
    expect(DECKS.cancelavel.black.length).toBe(76);
    expect(DECKS.cancelavel.white.length).toBe(460);
  });
});
