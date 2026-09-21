/**
 * References such as e12 name elements in the agent view. One element keeps one reference for the life of its document,
 * so a second snapshot of the same page reads the same. A navigation clears the table, and the numbering carries on,
 * so a reference from an earlier page never names an element of the next one.
 */
export class RefTable {
  private readonly byNode = new Map<number, string>();
  private readonly byRef = new Map<string, number>();
  private next = 1;
  /** Counts documents, so an error can tell a stale reference from one that never existed. */
  generation = 0;

  refFor(backendNodeId: number): string {
    const known = this.byNode.get(backendNodeId);
    if (known) return known;
    const ref = `e${this.next++}`;
    this.byNode.set(backendNodeId, ref);
    this.byRef.set(ref, backendNodeId);
    return ref;
  }

  /** The reference a node already carries, or nothing. Asking never makes a new one. */
  refOf(backendNodeId: number): string | undefined {
    return this.byNode.get(backendNodeId);
  }

  nodeFor(ref: string): number | undefined {
    return this.byRef.get(ref.trim().replace(/^\[|\]$/g, ''));
  }

  clear(): void {
    this.byNode.clear();
    this.byRef.clear();
    this.generation += 1;
  }
}
