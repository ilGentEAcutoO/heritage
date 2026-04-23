/** Core person record in the family tree */
export interface Person {
  id: string;
  name?: string;
  nameEn?: string;
  nick?: string;
  born: number | null;
  died: number | null;
  gender: 'm' | 'f';
  hometown?: string;
  parents?: string[];       // ordered [fatherId, motherId] or subset
  spouseOf?: string;        // id of spouse (directed; one side holds reference)
  isMe?: boolean;
  external?: boolean;       // person belongs to an external lineage
  lineageOf?: string;       // lineage code this external person belongs to
  isBridge?: boolean;       // appears in lineage preview AND main tree (bridge node)
}

/** A parent or spouse relation (directed) */
export interface Relation {
  id: string;
  treeId: string;
  fromId: string;           // child (for 'parent' kind)
  toId: string;             // parent (for 'parent' kind)
  kind: 'parent' | 'spouse';
}

/** A story (diary entry) attached to a person */
export interface Story {
  id?: string;
  personId: string;
  year: number;
  title: string;
  body: string;
  createdBy?: string;
  createdAt?: string;
}

/** A voice memo attached to a person */
export interface Memo {
  id?: string;
  personId: string;
  byId: string;             // who recorded (person id)
  duration: number;         // seconds
  title: string;
  recordedOn: string;       // ISO date string
  objectKey?: string;
}

/** A preview person inside an external lineage (not yet linked) */
export interface LineageMember {
  id: string;
  nick?: string;
  born?: number | null;
  died?: number | null;
  gender: 'm' | 'f';
  parents?: string[];
  spouseOf?: string;
  isBridge?: boolean;
}

/** External lineage metadata + preview members */
export interface Lineage {
  bridgePersonId: string;   // id of the bridge Person in the main tree
  family: string;           // Thai family name
  familyEn: string;
  code: string;
  members: number;          // total member count (full linked tree)
  linked: boolean;
  linkedTreeId?: string | null;
  preview?: LineageMember[];
}

/** A tree (family tree document) */
export interface Tree {
  id: string;
  slug: string;
  name: string;
  nameEn?: string;
  ownerId: string;
  visibility: 'public' | 'private' | 'shared';
  createdAt?: string;
}

/** Full tree data payload (returned by GET /api/tree/:slug) */
export interface TreeData {
  meta: {
    treeName: string;
    treeNameEn?: string;
    ownerId: string;
    visibility?: 'public' | 'private' | 'shared';
  };
  people: Person[];
  stories?: Record<string, Array<{ year: number; title: string; body: string }>>;
  memos?: Record<string, Array<{ by: string; duration: number; title: string; date: string }>>;
  photos?: Record<string, number>;
  externalLineages?: Record<string, Lineage>;
}

/** User-specific node position override (dx/dy from default layout) */
export interface PositionOverride {
  id?: string;
  userId: string;
  treeId: string;
  personId: string;
  dx: number;
  dy: number;
  updatedAt?: string;
}
