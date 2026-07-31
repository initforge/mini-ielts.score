export interface CollectionChip {
  id: number;
  label: string;
}

// ponytail: mirrors the dev seed fixture (seed.sql has one ETS 2024
// collection). Replace with a backend collections endpoint when S2 adds one.
export const COLLECTIONS: Record<'LR' | 'SW', CollectionChip[]> = {
  LR: [{ id: 1, label: 'ETS 2024' }],
  SW: [{ id: 1, label: 'ETS 2024' }],
};

export function getCollections(skillType: 'LR' | 'SW'): CollectionChip[] {
  return COLLECTIONS[skillType];
}
