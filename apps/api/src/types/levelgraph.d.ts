declare module "levelgraph" {
  namespace levelgraph {
    interface Triple {
    subject: string;
    predicate: string;
    object: string;
    limit?: number;
    reverse?: boolean;
  }

    type TriplePattern = Partial<Triple>;
    type Callback<Value = void> = (
    error: Error | null,
    value: Value,
  ) => void;

    interface LevelGraphDatabase {
    get(pattern: TriplePattern, callback: Callback<Triple[]>): void;
    put(
      triples: Triple | Triple[],
      callback: (error?: Error | null) => void,
    ): void;
    del(
      triples: Triple | Triple[],
      callback: (error?: Error | null) => void,
    ): void;
    close(callback?: (error?: Error | null) => void): void;
    isOpen(): boolean;
    generateBatch(
      triple: Triple,
      action?: "put" | "del",
    ): {
      type: "put" | "del";
      key: string;
      value: string;
    }[];
  }

    interface LevelCompatibleDatabase {
    batch(
      operations: readonly {
        type: "put" | "del";
        key: string;
        value?: string;
      }[],
      options: object,
      callback: (error?: Error | null) => void,
    ): void;
    values(options: object): unknown;
    close(callback?: (error?: Error | null) => void): void;
    isOpen(): boolean;
  }

  }

  function levelgraph(
    database: levelgraph.LevelCompatibleDatabase,
    options?: object,
  ): levelgraph.LevelGraphDatabase;

  export = levelgraph;
}
