// Core data model shared by every part of the app.

export type Gender = 'male' | 'female' | 'other'

/** Dates may be partial: "1923", "1923-05" or "1923-05-14". */
export type PartialDate = string

export interface GeoPoint {
  lat: number
  lng: number
}

export type PersonTag = 'sehit' | 'gazi' | 'hafiz' | 'hacı' | 'doktor' | 'ogretmen' | 'custom'

export interface PersonPhoto {
  id: string
  url: string
  caption?: string
  takenAt?: PartialDate
  addedBy?: string
  addedAt: string
}

export interface PersonDocument {
  id: string
  name: string
  url: string
  mime?: string
  addedAt: string
}

export interface Person {
  id: string
  firstName: string
  lastName: string
  maidenName?: string
  nickname?: string
  gender: Gender
  birthDate?: PartialDate
  birthPlace?: string
  birthGeo?: GeoPoint
  isDeceased: boolean
  deathDate?: PartialDate
  deathPlace?: string
  causeOfDeath?: string
  burialPlace?: string
  burialGeo?: GeoPoint
  residence?: string
  residenceGeo?: GeoPoint
  hometown?: string
  occupation?: string
  education?: string
  phone?: string
  email?: string
  bio?: string
  notes?: string
  tags?: string[]
  /** Main profile photo (URL or data URL). */
  photoUrl?: string
  photos?: PersonPhoto[]
  documents?: PersonDocument[]
  createdAt: string
  updatedAt: string
  createdBy?: string
  updatedBy?: string
}

export type ParentType = 'biological' | 'adopted' | 'step' | 'foster'
export type PartnerType = 'married' | 'divorced' | 'widowed' | 'partner' | 'engaged'

export interface ParentLink {
  id: string
  kind: 'parent'
  parentId: string
  childId: string
  type: ParentType
}

export interface PartnerLink {
  id: string
  kind: 'partner'
  aId: string
  bId: string
  type: PartnerType
  startDate?: PartialDate
  endDate?: PartialDate
  place?: string
}

export type Relation = ParentLink | PartnerLink

export type Role = 'admin' | 'editor' | 'member' | 'guest'
export type UserStatus = 'pending' | 'active' | 'blocked'

export interface AppUser {
  id: string
  email: string
  displayName: string
  avatarUrl?: string
  role: Role
  status: UserStatus
  /** The tree person this account represents. */
  personId?: string
  /** Person a new user says they are; an admin confirms it. */
  claimedPersonId?: string
  /** Free-text "who am I" note from a new user (parents' names, etc.). */
  claimNote?: string
  provider?: 'email' | 'google' | 'demo'
  consentAt?: string
  createdAt: string
  lastSeenAt?: string
}

/** Extra viewing rights granted by an admin. */
export interface AccessGrant {
  id: string
  userId: string
  /** 'all' = whole tree; 'branch' = ancestors + descendants of personId. */
  scope: 'all' | 'branch'
  personId?: string
  grantedBy: string
  createdAt: string
  expiresAt?: string
}

export type RequestStatus = 'pending' | 'approved' | 'rejected'

export interface AccessRequest {
  id: string
  userId: string
  scope: 'all' | 'branch'
  personId?: string
  message?: string
  status: RequestStatus
  createdAt: string
  reviewedBy?: string
  reviewedAt?: string
  reviewNote?: string
}

export type ChangeKind =
  | 'update_person'
  | 'create_person'
  | 'delete_person'
  | 'add_relation'
  | 'remove_relation'
  | 'set_photo'
  | 'add_photo'

export interface ChangeRequest {
  id: string
  userId: string
  kind: ChangeKind
  /** Target person (for update/delete/photo). */
  personId?: string
  /** Fields to change, the new person, or the relation. */
  payload: Record<string, unknown>
  /** Snapshot of the old values so admins can compare. */
  before?: Record<string, unknown>
  message?: string
  status: RequestStatus
  createdAt: string
  reviewedBy?: string
  reviewedAt?: string
  reviewNote?: string
}

export interface AuditEntry {
  id: string
  userId: string
  action: string
  entity: 'person' | 'relation' | 'user' | 'grant' | 'request' | 'invite' | 'settings' | 'import'
  entityId?: string
  before?: unknown
  after?: unknown
  createdAt: string
}

export interface Invite {
  id: string
  code: string
  personId?: string
  role: Role
  createdBy: string
  createdAt: string
  usedBy?: string
  usedAt?: string
  expiresAt?: string
}

export interface FamilySettings {
  familyName: string
  /** Person shown first when the tree opens for admins. */
  rootPersonId?: string
  allowSignup: boolean
  hideLivingDetails: boolean
  welcomeText?: string
}

export interface Notification {
  id: string
  userId: string
  title: string
  body?: string
  link?: string
  read: boolean
  createdAt: string
}

export interface FamilyData {
  persons: Person[]
  relations: Relation[]
  users: AppUser[]
  grants: AccessGrant[]
  accessRequests: AccessRequest[]
  changeRequests: ChangeRequest[]
  audit: AuditEntry[]
  invites: Invite[]
  notifications: Notification[]
  settings: FamilySettings
}
