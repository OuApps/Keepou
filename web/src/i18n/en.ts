/**
 * English UI copy (E12) — the mirror of `fr.ts`. Typed as `Copy` (= typeof fr)
 * so the compiler rejects any missing key or mismatched function signature: the
 * two locales can never drift out of shape. Keep this a faithful translation of
 * the frozen French wording (design/HANDOFF.md §7).
 */
import type { Copy } from './fr'

/** English fallback for a missing lock-holder name (degraded payloads only). */
const someone = (holder: string | null) => holder ?? 'Someone'

export const en: Copy = {
  COMMON_COPY: {
    appName: 'Keepou',
    loading: 'Loading…',
    backToBoard: 'Back to board',
    cancel: 'Cancel',
    confirm: 'Confirm',
    close: 'Close',
    save: 'Save',
    delete: 'Delete',
    networkError: 'Network error',
  },

  THEME_COPY: {
    title: 'Theme',
    toDark: 'Switch to dark theme',
    toLight: 'Switch to light theme',
  },

  LANG_COPY: {
    label: 'Language',
    french: 'Français',
    english: 'English',
    switchTo: (language: string) => `Show Keepou in ${language}`,
  },

  AUTH_COPY: {
    // Login
    email: 'Email',
    password: 'Password',
    signIn: 'Sign in',
    showPassword: 'Show password',
    hidePassword: 'Hide password',
    badCredentials: 'Incorrect email or password.',
    suspended: 'Your access has been suspended. Contact the administrator.',
    loginFailed: 'Sign-in failed. Please try again in a moment.',
    noAccountYet: 'No account yet?',
    createAccountLink: 'Create an account',

    // Register
    registerTitle: 'Create an account',
    registerSubtitle:
      'Keepou is a private instance. Your account is only created if your email is on the ' +
      'allowlist.',
    displayName: 'Display name',
    registerSubmit: 'Create my account',
    emailTaken: 'An account already exists with this email address.',
    registerFailed: 'Account creation failed. Please try again in a moment.',
    alreadyAccount: 'Already have an account?',
    signInLink: 'Sign in',

    // Allowlist denial
    deniedTitle: 'Access not allowed',
    deniedBefore: 'The address ',
    deniedAfter: ' is not on the list of allowed members of this Keepou instance.',
    deniedHint:
      'Ask your instance administrator to add your email. You will then be able to create your ' +
      'account.',
    backToLogin: 'Back to sign-in',
  },

  BOARD_COPY: {
    searchPlaceholder: 'Search my notes…',
    searchClear: 'Clear search',
    tablistLabel: 'Boards',
    tabMine: 'My notes',
    tabPublic: 'Public',
    accountMenu: 'Account menu',
    adminEntry: 'Administration',
    archivedEntry: 'Archived notes',
    signOut: 'Sign out',
    loadFailed: 'Could not load your notes. Please try again in a moment.',
    emptySearch: 'No note matches your search.',
    emptyMine: 'No notes yet — write your first note above.',
    emptyPublic: 'No public notes yet.',

    // Sort selector (E11)
    sortLabel: 'Sort notes',
    sortModified: 'Date modified',
    sortCreated: 'Date created',
    sortTitle: 'Title (A→Z)',

    // Density selector (E11 follow-up) — full cards vs. capped previews
    densityLabel: 'Display density',
    densityFull: 'Full notes',
    densityCompact: 'Preview',

    // Archived view (E8) + pin / archive card actions
    archivedTitle: 'Archived notes',
    archivedBack: 'Back to board',
    emptyArchived: 'No archived notes.',
    cardActions: (title: string) => `Actions for ${title || 'the untitled note'}`,
    pin: 'Pin',
    unpin: 'Unpin',
    archive: 'Archive',
    unarchive: 'Unarchive',
    pinnedBadge: 'Pinned',
    organizeFailed: 'Action failed. Please try again in a moment.',

    // Hard delete (E11)
    deleteAction: 'Delete permanently',
    deleteConfirmTitle: 'Delete permanently?',
    deleteConfirmText: 'This note and its history will be deleted. This action is irreversible.',
    deleteFailed: 'Deletion failed. Please try again in a moment.',

    // Archive multi-select (E11)
    selectNote: (title: string) => `Select ${title || 'the untitled note'}`,
    selectAll: 'Select all',
    deselectAll: 'Deselect all',
    deleteSelected: (n: number) => `Delete permanently (${n})`,
    bulkDeleteConfirmTitle: (n: number) => (n === 1 ? 'Delete 1 note?' : `Delete ${n} notes?`),
    bulkDeleteConfirmText:
      'The selected notes and their history will be deleted. This action is irreversible.',

    // Composer
    composerPlaceholder: 'Take a note…',
    composerAdd: 'Add',
    composerColorLabel: 'Note color',
    composerPublic: 'Public',
    composerClose: 'Close',
    composerFailed: 'The note could not be created. Please try again in a moment.',

    // Cards
    untitled: 'Untitled note',
    publicByYou: 'Public · shared by you',
    privateMeta: (when: string) => `Private · ${when}`,
    authorMeta: (author: string, when: string) => `${author} · edited ${when}`,
  },

  SAVE_COPY: {
    dirty: 'Edited',
    saving: 'Saving…',
    saved: (when: string) => `Saved · ${when}`,
  },

  EDITOR_COPY: {
    untitled: 'Untitled note',
    titlePlaceholder: 'Title',
    titleLabel: 'Note title',
    paragraphLabel: 'Paragraph',
    paragraphPlaceholder: 'Write your note…',
    checkboxLabel: 'Checkbox',
    checkboxItemLabel: 'Checkbox label',
    checkboxItemPlaceholder: 'New item',
    insertCheckbox: 'Insert a checkbox',
    clearChecked: 'Remove checked boxes',
    copyNote: 'Copy note',
    copyNoteDone: 'Note copied',
    colorLabel: 'Note color',
    visibilityPublic: 'Public',
    confirmPrivateLabel: 'Confirm switch to private',
    confirmPrivateText: 'This note will no longer be visible to others.',
    lastSavedBy: 'Last saved version by',
    lastEditedBy: 'Last edited by',
    history: 'History',
    done: 'Done',
    ok: 'OK',
    back: 'Back to board',
    notFound: 'Note not found.',
    moreActions: 'Note actions',
  },

  PROFILE_COPY: {
    menuEntry: 'Change my name',
    title: 'Change my display name',
    label: 'Display name',
    save: 'Save',
    emptyName: 'Choose a display name.',
    failed: 'The change failed. Please try again in a moment.',
  },

  LOCK_COPY: {
    mine: 'You are editing this note',
    locked: (holder: string | null) => `🔒 ${someone(holder)} is editing — read-only`,
    available: (holder: string | null) =>
      holder === null ? 'Note available' : `${holder} finished editing — note available`,
    conflict: (holder: string | null) => `${someone(holder)} is editing this note`,
    live: 'live',
    readOnlyNote: (holder: string | null) =>
      `Editing is unavailable while ${someone(holder)} is editing the note. The view updates in ` +
      'real time.',
    takeover: 'Edit the note',
    conflictText: (holder: string | null) =>
      `${someone(holder)} started editing this note while you were away. Your latest changes ` +
      'could not be saved.',
    goReadOnly: 'Switch to read-only',
  },

  HISTORY_COPY: {
    dialogLabel: 'Version history',
    panelTitle: 'History',
    backToEditor: 'Back to the editor',
    closePanel: 'Close history',
    backToEditing: 'Back to editing',
    versionCount: (n: number) => `${n} version${n > 1 ? 's' : ''}`,
    since: (day: string) => ` · since ${day}`,
    currentBadge: 'current',
    createdBy: 'Created by',
    modifiedBy: 'Edited by',
    restoreThis: 'Restore this version',
    currentVersion: 'Current version',
    previewOf: (when: string) => `Preview — ${when}`,
    previewBanner: 'Preview — read-only',
    versionOf: (author: string, moment: string) => `Version by ${author} · ${moment}`,
    currentMeta: (author: string) => `Current version · ${author}`,
    versionMeta: (author: string) => `Version by ${author}`,
    empty: 'No version saved yet.',
    noteNotFound: 'Note not found.',
    restoreConfirmLabel: 'Restore confirmation',
    restoreTitleBefore: 'Restore the version from ',
    restoreKeptBefore: 'The current version will be ',
    restoreKeptBold: 'kept in the history',
    restoreKeptAfter: (author: string, at: string) =>
      ` — nothing is lost. This note's content becomes ${author}'s again ${at}.`,
    restoreFailed: 'Restore failed. Please try again.',
    restoreLocked: (holder: string) => `${holder} is editing — try again later.`,
  },

  ADMIN_COPY: {
    title: 'Administration',
    restricted: 'Access restricted to instance administrators.',
    managerTitle: 'Access management',
    managerSubtitle: 'Only allowed emails can create an account on this instance.',
    addPlaceholder: 'Add an email…',
    addLabel: 'Email address to allow',
    addLong: 'Add to the list',
    addShort: 'Add',
    tabMembers: 'Members',
    tabPendingLong: 'Pending invitees',
    tabPendingShort: 'Pending',
    emptyPending: 'No pending invitees — add an email to allow a new member.',
    adminBadge: 'admin',
    statusActive: 'Active',
    statusDisabled: 'Disabled',
    statusPending: 'Pending',
    registeredOn: (day: string) => ` · registered on ${day}`,
    allowedOn: (day: string) => `Allowed on ${day} · `,
    noAccountYet: 'no account yet',
    actionsFor: (name: string) => `Actions for ${name}`,
    promote: 'Promote to admin',
    demote: 'Demote to member',
    disable: 'Disable account',
    enable: 'Re-enable account',
    remove: 'Remove',
  },

  NOT_FOUND_COPY: {
    title: 'Page not found',
    text: 'This page does not exist.',
  },

  COLOR_LABELS: {
    GOLD: 'Gold',
    AVOCAT: 'Avocado',
    SALSA: 'Salsa',
    CLAY: 'Clay',
    TEAL: 'Teal',
  },

  IMPORT_COPY: {
    menuEntry: 'Import from Google Keep',
    title: 'Import from Google Keep',

    // Upload screen
    uploadIntro:
      'First get your notes from Google, then drop the archive here — you will then choose, ' +
      'note by note, what goes into Keepou.',
    uploadSteps: [
      'Open Google Takeout, select only Keep, and create the export (.zip format).',
      'Download the takeout-….zip archive you receive by email — without unzipping it.',
      'Drop it below, then Continue.',
    ],
    takeoutUrl: 'https://takeout.google.com',
    step1Before: 'Open ',
    step1Link: 'Google Takeout',
    step1After: ', select only Keep, and create the export (.zip format).',
    dropLabel: 'Drop your export here, or browse…',
    dropBefore: 'Drop your export here, or ',
    dropBrowse: 'browse…',
    dropHint: '.zip archive · 20 MB maximum',
    continue: 'Continue',
    analyzing: 'Analyzing the archive…',
    cancel: 'Cancel',

    // Review screen
    found: (n: number) => (n === 1 ? '1 note found' : `${n} notes found`),
    foundSuffix: 'in your export',
    unreadable: (n: number) =>
      n === 1 ? '1 unreadable file will be ignored' : `${n} unreadable files will be ignored`,
    privateNote: 'Imported notes will be private — you can make them public afterwards.',
    checkAll: 'Check all',
    uncheckAll: 'Uncheck all',
    trashChip: 'Trash',
    selectedCount: (n: number, total: number) =>
      n === 1 ? `1 selected of ${total}` : `${n} selected of ${total}`,
    importN: (n: number) => (n === 1 ? 'Import the note' : `Import the ${n} notes`),
    importing: 'Importing…',
    untitled: 'Untitled note',

    // Summary screen
    imported: (n: number) => (n === 1 ? '1 note imported' : `${n} notes imported`),
    duplicates: (n: number) => (n === 1 ? '1 duplicate skipped' : `${n} duplicates skipped`),
    failedFiles: (n: number) => (n === 1 ? '1 unreadable file' : `${n} unreadable files`),
    summaryNote: 'Your Keep notes keep their original date and stay private.',
    seeMyNotes: 'See my notes',
  },

  TOKEN_COPY: {
    menuEntry: 'Agent access (MCP)',
    title: 'Agent access (MCP)',
    intro:
      'Generate a token to connect an assistant (AI agent) to your Keepou notes over MCP — ' +
      'for example from a WhatsApp or Telegram bot.',
    endpointLabel: 'MCP server address',
    copyEndpoint: 'Copy the address',
    nameLabel: 'Token name',
    namePlaceholder: 'WhatsApp bot…',
    generate: 'Generate a token',
    generating: 'Generating…',
    emptyName: 'Give this token a name.',
    createFailed: 'Generation failed. Please try again in a moment.',
    createdTitle: 'Copy your token now',
    createdWarning:
      'This token will not be shown again. Copy it and paste it into your agent’s configuration.',
    copyToken: 'Copy the token',
    copied: 'Copied',
    doneCreating: 'I copied the token',
    listTitle: 'Active tokens',
    empty: 'No tokens yet.',
    createdOn: (day: string) => `Created on ${day}`,
    lastUsed: (when: string) => `· used ${when}`,
    neverUsed: '· never used',
    revoke: 'Revoke',
    revokeConfirmTitle: 'Revoke this token?',
    revokeConfirmText:
      'The agent using it will lose access immediately. This action is irreversible.',
    revokeFailed: 'Revocation failed. Please try again in a moment.',
    loadFailed: 'Could not load your tokens. Please try again in a moment.',
  },
}
