import {
  Direction,
  DirectionVectors,
  type Position,
  type ChunkCoords,
  type Grid,
  type WordPlacement,
  type Statistics,
} from "./types";
import { readFileSync } from "fs";
import { join } from "path";

class InfiniteWordSearch {
  private chunkSize: number;
  private chunks: Map<string, Grid>;
  private words: string[];
  private placedWords: Map<string, WordPlacement>;
  private wordPositions: Map<string, Position[]>;
  private generatedChunks: Set<string>;
  private foundWords: Map<string, { word: string; coords: Position[] }>;

  constructor(chunkSize: number = 10, words?: string[]) {
    this.chunkSize = chunkSize;
    this.chunks = new Map();
    this.words = words || this.getDefaultWords();
    this.placedWords = new Map();
    this.wordPositions = new Map();
    this.generatedChunks = new Set();
    this.foundWords = new Map();

    this.generateChunk(0, 0);
  }

  private getDefaultWords(): string[] {
    try {
      const wordsFilePath = join(__dirname, "words.txt");
      const fileContent = readFileSync(wordsFilePath, "utf-8");
      const words = fileContent
        .split("\n")
        .map((word) => word.trim())
        .filter((word) => word.length > 0);
      return words;
    } catch (error) {
      console.error("Error reading words.txt, using fallback words:", error);
      // Fallback to a few default words if file reading fails
      return ["PYTHON", "ALGORITHM", "COMPUTER", "PROGRAM", "CODE", "DATA"];
    }
  }

  private chunkCoordsToKey(coords: ChunkCoords): string {
    return `${coords[0]},${coords[1]}`;
  }

  private getChunkCoords(row: number, col: number): ChunkCoords {
    const chunkRow = Math.floor(row / this.chunkSize);
    const chunkCol = Math.floor(col / this.chunkSize);
    return [chunkRow, chunkCol];
  }

  private getLocalCoords(row: number, col: number): Position {
    const localRow = ((row % this.chunkSize) + this.chunkSize) % this.chunkSize;
    const localCol = ((col % this.chunkSize) + this.chunkSize) % this.chunkSize;
    return [localRow, localCol];
  }

  private ensureChunkExists(chunkRow: number, chunkCol: number): void {
    const chunkCoords: ChunkCoords = [chunkRow, chunkCol];
    const key = this.chunkCoordsToKey(chunkCoords);

    if (!this.chunks.has(key)) {
      this.generateChunk(chunkRow, chunkCol);
    }
  }

  private seededRandom(seed: number): () => number {
    let value = seed;
    return () => {
      value = (value * 9301 + 49297) % 233280;
      return Math.abs(value / 233280);
    };
  }

  private hashChunkCoords(coords: ChunkCoords): number {
    return (coords[0] * 73856093) ^ (coords[1] * 19349663);
  }

  private generateChunk(chunkRow: number, chunkCol: number): void {
    const chunkCoords: ChunkCoords = [chunkRow, chunkCol];
    const key = this.chunkCoordsToKey(chunkCoords);

    if (this.generatedChunks.has(key)) {
      return;
    }

    const chunk: Grid = Array(this.chunkSize)
      .fill(null)
      .map(() => Array(this.chunkSize).fill(""));

    this.chunks.set(key, chunk);
    this.generatedChunks.add(key);

    const seed = this.hashChunkCoords(chunkCoords);
    const random = this.seededRandom(seed);

    const numWords = Math.floor(random() * 4) + 2; // 2-5 words

    for (let i = 0; i < numWords; i++) {
      const wordIndex = Math.abs(Math.floor(random() * this.words.length));
      const word = this.words[wordIndex]?.toUpperCase();
      this.placeWordInChunk(word!, chunkRow, chunkCol, random);
    }

    this.fillEmptyCellsInChunk(chunkRow, chunkCol, random);
  }

  private placeWordInChunk(
    word: string,
    chunkRow: number,
    chunkCol: number,
    random: () => number,
  ): boolean {
    const key = this.chunkCoordsToKey([chunkRow, chunkCol]);
    const chunk = this.chunks.get(key);

    if (!chunk) return false;

    for (let attempt = 0; attempt < 50; attempt++) {
      const directions = Object.values(Direction);
      const directionIndex = Math.abs(Math.floor(random() * directions.length));
      const direction = directions[directionIndex]!;

      const localRow = Math.floor(random() * this.chunkSize);
      const localCol = Math.floor(random() * this.chunkSize);

      const globalRow = chunkRow * this.chunkSize + localRow;
      const globalCol = chunkCol * this.chunkSize + localCol;

      if (this.canPlaceWord(word, globalRow, globalCol, direction, true)) {
        this.doPlaceWord(
          word,
          globalRow,
          globalCol,
          direction,
          chunkRow,
          chunkCol,
        );
        return true;
      }
    }

    return false;
  }

  private canPlaceWord(
    word: string,
    row: number,
    col: number,
    direction: Direction,
    checkCrossChunk: boolean = false,
  ): boolean {
    const [dr, dc] = DirectionVectors[direction];

    //TODO: check if is possible improve this
    if (checkCrossChunk) {
      const endRow = row + (word.length - 1) * dr;
      const endCol = col + (word.length - 1) * dc;

      const startChunk = this.getChunkCoords(row, col);
      const endChunk = this.getChunkCoords(endRow, endCol);

      if (startChunk[0] !== endChunk[0] || startChunk[1] !== endChunk[1]) {
        return false;
      }
    }

    for (let i = 0; i < word.length; i++) {
      const newRow = row + i * dr;
      const newCol = col + i * dc;

      const currentCell = this.getCell(newRow, newCol);
      if (
        currentCell !== null &&
        currentCell !== "" &&
        currentCell !== word[i]
      ) {
        return false;
      }
    }

    return true;
  }

  private doPlaceWord(
    word: string,
    row: number,
    col: number,
    direction: Direction,
    chunkRow: number,
    chunkCol: number,
  ): void {
    const [dr, dc] = DirectionVectors[direction];
    const positions: Position[] = [];

    for (let i = 0; i < word.length; i++) {
      const newRow = row + i * dr;
      const newCol = col + i * dc;
      this.setCell(newRow, newCol, word[i]!);
      positions.push([newRow, newCol]);
    }

    const wordId = `${word}_${row}_${col}_${chunkRow}_${chunkCol}`;

    const placement: WordPlacement = {
      word,
      startRow: row,
      startCol: col,
      direction,
      chunkCoords: [chunkRow, chunkCol],
      wordId,
      founded: false,
    };

    this.placedWords.set(wordId, placement);
    this.wordPositions.set(wordId, positions);
  }

  private fillEmptyCellsInChunk(
    chunkRow: number,
    chunkCol: number,
    random: () => number,
  ): void {
    const key = this.chunkCoordsToKey([chunkRow, chunkCol]);
    const chunk = this.chunks.get(key);

    if (!chunk) return;

    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    for (let i = 0; i < this.chunkSize; i++) {
      for (let j = 0; j < this.chunkSize; j++) {
        if (chunk[i]![j] === "") {
          const letterIndex = Math.floor(random() * alphabet.length);
          chunk[i]![j] = alphabet[letterIndex]!;
        }
      }
    }
  }

  public getCell(row: number, col: number): string | null {
    const chunkCoords = this.getChunkCoords(row, col);
    this.ensureChunkExists(...chunkCoords);

    const key = this.chunkCoordsToKey(chunkCoords);
    const chunk = this.chunks.get(key);

    if (!chunk) return null;

    const [localRow, localCol] = this.getLocalCoords(row, col);
    return chunk[localRow]![localCol]!;
  }

  public setCell(row: number, col: number, value: string): void {
    const chunkCoords = this.getChunkCoords(row, col);
    this.ensureChunkExists(...chunkCoords);

    const key = this.chunkCoordsToKey(chunkCoords);
    const chunk = this.chunks.get(key);

    if (!chunk) return;

    const [localRow, localCol] = this.getLocalCoords(row, col);
    chunk[localRow]![localCol] = value;
  }

  public getRegion(
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
  ): Grid {
    const region: Grid = [];

    for (let row = startRow; row <= endRow; row++) {
      const regionRow: string[] = [];
      for (let col = startCol; col <= endCol; col++) {
        const cell = this.getCell(row, col);
        regionRow.push(cell || " ");
      }
      region.push(regionRow);
    }

    return region;
  }

  public validateSelection(coords: Position[]): string | null {
    if (!coords || coords.length === 0) {
      return null;
    }

    for (const [wordId, positions] of this.wordPositions.entries()) {
      if (positions.length !== coords.length) {
        continue;
      }

      const coordsSet = new Set(coords.map((c) => `${c[0]},${c[1]}`));
      const positionsSet = new Set(positions.map((p) => `${p[0]},${p[1]}`));

      if (this.setsEqual(coordsSet, positionsSet)) {
        if (
          this.arraysEqual(coords, positions) ||
          this.arraysEqual(coords, [...positions].reverse())
        ) {
          const word = this.placedWords.get(wordId);

          if (!word || word.founded) {
            return null;
          }

          // Mark as founded and add to foundWords state
          this.placedWords.set(wordId, { ...word, founded: true });
          this.foundWords.set(wordId, {
            word: word.word,
            coords: positions,
          });

          const wordName = wordId.split("_")[0];
          return wordName!;
        }
      }
    }

    return null;
  }

  private setsEqual<T>(set1: Set<T>, set2: Set<T>): boolean {
    if (set1.size !== set2.size) return false;
    for (const item of set1) {
      if (!set2.has(item)) return false;
    }
    return true;
  }

  private arraysEqual<T>(arr1: T[], arr2: T[]): boolean {
    if (arr1.length !== arr2.length) return false;
    for (let i = 0; i < arr1.length; i++) {
      const [r1, c1] = arr1[i] as unknown as Position;
      const [r2, c2] = arr2[i] as unknown as Position;
      if (r1 !== r2 || c1 !== c2) return false;
    }
    return true;
  }

  public expandToPosition(row: number, col: number): void {
    const chunkCoords = this.getChunkCoords(row, col);
    this.ensureChunkExists(...chunkCoords);
  }

  public getGeneratedBounds(): [number, number, number, number] {
    if (this.chunks.size === 0) {
      return [0, 0, 0, 0];
    }

    let minChunkRow = Infinity;
    let maxChunkRow = -Infinity;
    let minChunkCol = Infinity;
    let maxChunkCol = -Infinity;

    for (const key of this.chunks.keys()) {
      const [row, col] = key.split(",").map(Number);
      minChunkRow = Math.min(minChunkRow, row!);
      maxChunkRow = Math.max(maxChunkRow, row!);
      minChunkCol = Math.min(minChunkCol, col!);
      maxChunkCol = Math.max(maxChunkCol, col!);
    }

    const minRow = minChunkRow * this.chunkSize;
    const maxRow = (maxChunkRow + 1) * this.chunkSize - 1;
    const minCol = minChunkCol * this.chunkSize;
    const maxCol = (maxChunkCol + 1) * this.chunkSize - 1;

    return [minRow, minCol, maxRow, maxCol];
  }

  public displayRegion(
    centerRow: number = 0,
    centerCol: number = 0,
    radius: number = 15,
    showWords: boolean = true,
  ): void {
    const startRow = centerRow - radius;
    const endRow = centerRow + radius;
    const startCol = centerCol - radius;
    const endCol = centerCol + radius;

    console.log(`\n${"=".repeat(60)}`);
    console.log(
      `INFINITE WORD SEARCH - Region [${startRow}:${endRow}, ${startCol}:${endCol}]`,
    );
    console.log(`Chunks generated: ${this.chunks.size}`);
    console.log("=".repeat(60));

    let header = "     ";
    for (let j = startCol; j <= Math.min(endCol, startCol + 29); j++) {
      header += j.toString().padStart(4, " ");
    }
    console.log(header);

    for (let i = startRow; i <= endRow; i++) {
      let row = i.toString().padStart(4, " ") + " ";
      for (let j = startCol; j <= Math.min(endCol, startCol + 29); j++) {
        const cell = this.getCell(i, j);
        row += `  ${cell} `;
      }
      console.log(row);
    }

    if (showWords) {
      const wordsInRegion = new Set<string>();

      for (const placement of this.placedWords.values()) {
        const positions = this.getWordPositions(placement);
        const inRegion = positions.some(
          ([r, c]) =>
            r >= startRow && r <= endRow && c >= startCol && c <= endCol,
        );

        if (inRegion) {
          wordsInRegion.add(placement.word);
        }
      }

      if (wordsInRegion.size > 0) {
        console.log("\nWORDS IN THIS REGION:");
        for (const word of wordsInRegion) {
          console.log(`- ${word}`);
        }
      }
    }
  }

  public getSampleWords() {
    const wordIds = Array.from(this.wordPositions.keys());
    const index = Math.floor(Math.random() * wordIds.length);

    return this.wordPositions.get(wordIds[index]!);
  }

  private getWordPositions(placement: WordPlacement): Position[] {
    const [dr, dc] = DirectionVectors[placement.direction];
    const positions: Position[] = [];

    for (let i = 0; i < placement.word.length; i++) {
      positions.push([
        placement.startRow + i * dr,
        placement.startCol + i * dc,
      ]);
    }

    return positions;
  }

  public getStatistics(): Statistics {
    const bounds = this.getGeneratedBounds();
    const totalCells = this.chunks.size * this.chunkSize * this.chunkSize;

    return {
      chunksGenerated: this.chunks.size,
      placedWords: this.placedWords.size,
      totalCells: totalCells,
      bounds: bounds,
      areaSize: [bounds[2] - bounds[0] + 1, bounds[3] - bounds[1] + 1],
    };
  }

  public getFoundWords(): Array<{ word: string; coords: Position[] }> {
    return Array.from(this.foundWords.values());
  }
}

function main(): void {
  console.log("Creating infinite word search...");
  const wordSearch = new InfiniteWordSearch(10);

  wordSearch.displayRegion(0, 0, 12);

  console.log("\n" + "=".repeat(60));
  console.log("EXPANDING THE GRID");
  console.log("=".repeat(60));

  console.log("\nExpanding to position (25, 25)...");
  wordSearch.expandToPosition(25, 25);
  wordSearch.displayRegion(25, 25, 10);

  console.log("\nExpanding to position (-15, -15)...");
  wordSearch.expandToPosition(-15, -15);
  wordSearch.displayRegion(-15, -15, 10);

  console.log("\nExpanding to position (-150, -150)...");
  wordSearch.expandToPosition(-150, -150);
  wordSearch.displayRegion(-15, -15, 100);

  console.log("\n" + "=".repeat(60));
  console.log("VALIDATION TEST");
  console.log("=".repeat(60));

  console.log("\n" + "=".repeat(60));
  console.log("CONTINUOUS NAVIGATION");
  console.log("=".repeat(60));

  const positionsToExplore: Position[] = [
    [50, 50],
    [100, 0],
    [-50, 30],
    [0, -40],
    [800, 1560],
  ];

  for (const [posRow, posCol] of positionsToExplore) {
    console.log(`\nExploring region at (${posRow}, ${posCol})...`);
    wordSearch.expandToPosition(posRow, posCol);

    const region = wordSearch.getRegion(
      posRow - 12,
      posCol - 12,
      posRow + 12,
      posCol + 12,
    );

    console.log("25x25 sample of the region:");
    for (const row of region) {
      console.log(row.join(" "));
    }
  }

  const testCoords: Position[] = [
    [0, 9],
    [1, 9],
    [2, 9],
    [3, 9],
    [4, 9],
    [5, 9],
    [6, 9],
    [7, 9],
    [8, 9],
    [9, 9],
  ];
  const letters = testCoords.map(([r, c]) => wordSearch.getCell(r, c)).join("");
  const result = wordSearch.validateSelection(testCoords);

  console.log(`\nTesting coordinates ${JSON.stringify(testCoords)}:`);
  console.log(`Letters: ${letters}`);
  console.log(`Result: ${result ? "VALID!" : "No word found"}`);

  console.log("\n" + "=".repeat(60));
  console.log("INFINITE GRID STATISTICS");
  console.log("=".repeat(60));

  const stats = wordSearch.getStatistics();
  console.log(`Chunks generated: ${stats.chunksGenerated}`);
  console.log(`Placed words: ${stats.placedWords}`);
  console.log(`Total cells: ${stats.totalCells}`);
  console.log(`Bounds: ${JSON.stringify(stats.bounds)}`);
  console.log(`Area size: ${JSON.stringify(stats.areaSize)}`);
  console.log(`Word: ${JSON.stringify(wordSearch.getSampleWords())}`);
}

export { InfiniteWordSearch };

// main();
