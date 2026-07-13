/**
 * French UI copy — the reference locale (E12). Every user-facing string lives
 * here, grouped by screen; the English mirror is `en.ts`, kept in exact shape by
 * the `Copy` type (`typeof fr`). The wording is frozen in `design/HANDOFF.md` §7
 * — change it there first, then here. French stays the product's first language
 * (design/claude.md); the English locale is a reach add-on, not a replacement.
 */

/** « Quelqu'un » only ever shows on degraded payloads — the 409 names the holder. */
const someone = (holder: string | null) => holder ?? 'Quelqu’un'

export const fr = {
  COMMON_COPY: {
    appName: 'Keepou',
    loading: 'Chargement…',
    backToBoard: 'Retour au board',
    cancel: 'Annuler',
    confirm: 'Confirmer',
    close: 'Fermer',
    save: 'Enregistrer',
    delete: 'Supprimer',
    networkError: 'Erreur réseau',
  },

  THEME_COPY: {
    title: 'Thème',
    toDark: 'Passer en thème sombre',
    toLight: 'Passer en thème clair',
  },

  // Language switcher (E12) — lives in the account menu, under « Modifier mon nom ».
  // The language names are endonyms, shown the same in every locale.
  LANG_COPY: {
    label: 'Langue',
    french: 'Français',
    english: 'English',
    switchTo: (language: string) => `Afficher Keepou en ${language}`,
  },

  AUTH_COPY: {
    // Login
    email: 'E-mail',
    password: 'Mot de passe',
    signIn: 'Se connecter',
    showPassword: 'Afficher le mot de passe',
    hidePassword: 'Masquer le mot de passe',
    badCredentials: 'E-mail ou mot de passe incorrect.',
    suspended: "Ton accès a été suspendu. Contacte l'administrateur.",
    loginFailed: 'Connexion impossible. Réessaie dans un instant.',
    noAccountYet: 'Pas encore de compte ?',
    createAccountLink: 'Créer un compte',

    // Register
    registerTitle: 'Créer un compte',
    registerSubtitle:
      "Keepou est une instance privée. Ton compte n'est créé que si ton e-mail figure sur la " +
      'liste autorisée.',
    displayName: 'Nom affiché',
    registerSubmit: 'Créer mon compte',
    emailTaken: 'Un compte existe déjà avec cette adresse e-mail.',
    registerFailed: 'Création du compte impossible. Réessaie dans un instant.',
    alreadyAccount: 'Déjà un compte ?',
    signInLink: 'Se connecter',

    // Allowlist denial
    deniedTitle: 'Accès non autorisé',
    // The e-mail is rendered <b> between the two halves.
    deniedBefore: "L'adresse ",
    deniedAfter: ' ne figure pas sur la liste des membres autorisés de cette instance Keepou.',
    deniedHint:
      "Demande à l'administrateur de ton instance d'ajouter ton e-mail. Tu pourras ensuite " +
      'créer ton compte.',
    backToLogin: 'Retour à la connexion',
  },

  BOARD_COPY: {
    searchPlaceholder: 'Rechercher dans mes notes…',
    searchClear: 'Effacer la recherche',
    tablistLabel: 'Tableaux',
    tabMine: 'Mes notes',
    tabPublic: 'Public',
    accountMenu: 'Menu du compte',
    adminEntry: 'Administration',
    archivedEntry: 'Notes archivées',
    signOut: 'Se déconnecter',
    loadFailed: 'Impossible de charger les notes. Réessaie dans un instant.',
    emptySearch: 'Aucune note ne correspond à ta recherche.',
    emptyMine: 'Aucune note pour l’instant — écris ta première note ci-dessus.',
    emptyPublic: 'Aucune note publique pour l’instant.',

    // Sort selector (E11)
    sortLabel: 'Trier les notes',
    sortModified: 'Date de modification',
    sortCreated: 'Date de création',
    sortTitle: 'Titre (A→Z)',

    // Density selector (E11 follow-up) — full cards vs. capped previews
    densityLabel: 'Densité d’affichage',
    densityFull: 'Notes entières',
    densityCompact: 'Aperçu',

    // Archived view (E8) + pin / archive card actions
    archivedTitle: 'Notes archivées',
    archivedBack: 'Retour au board',
    emptyArchived: 'Aucune note archivée.',
    cardActions: (title: string) => `Actions pour ${title || 'la note sans titre'}`,
    pin: 'Épingler',
    unpin: 'Ne plus épingler',
    archive: 'Archiver',
    unarchive: 'Désarchiver',
    pinnedBadge: 'Épinglée',
    organizeFailed: 'Action impossible. Réessaie dans un instant.',

    // Hard delete (E11)
    deleteAction: 'Supprimer définitivement',
    deleteConfirmTitle: 'Supprimer définitivement ?',
    deleteConfirmText:
      'Cette note et son historique seront supprimés. Cette action est irréversible.',
    deleteFailed: 'La suppression a échoué. Réessaie dans un instant.',

    // Archive multi-select (E11)
    selectNote: (title: string) => `Sélectionner ${title || 'la note sans titre'}`,
    selectAll: 'Tout sélectionner',
    deselectAll: 'Tout désélectionner',
    deleteSelected: (n: number) => `Supprimer définitivement (${n})`,
    bulkDeleteConfirmTitle: (n: number) =>
      n === 1 ? 'Supprimer 1 note ?' : `Supprimer ${n} notes ?`,
    bulkDeleteConfirmText:
      'Les notes sélectionnées et leur historique seront supprimés. Cette action est irréversible.',

    // Composer
    composerPlaceholder: 'Prends une note…',
    composerAdd: 'Ajouter',
    composerColorLabel: 'Couleur de la note',
    composerPublic: 'Public',
    composerClose: 'Fermer',
    composerFailed: "La note n'a pas pu être créée. Réessaie dans un instant.",

    // Cards
    untitled: 'Note sans titre',
    publicByYou: 'Public · partagé par toi',
    privateMeta: (when: string) => `Privé · ${when}`,
    authorMeta: (author: string, when: string) => `${author} · modifié ${when}`,
  },

  SAVE_COPY: {
    dirty: 'Modifié',
    saving: 'Enregistrement…',
    saved: (when: string) => `Enregistré · ${when}`,
  },

  EDITOR_COPY: {
    untitled: 'Note sans titre',
    titlePlaceholder: 'Titre',
    titleLabel: 'Titre de la note',
    paragraphLabel: 'Paragraphe',
    paragraphPlaceholder: 'Écris ta note…',
    checkboxLabel: 'Case à cocher',
    checkboxItemLabel: 'Intitulé de la case',
    checkboxItemPlaceholder: 'Nouvel élément',
    insertCheckbox: 'Insérer une case à cocher',
    // Appears only when ≥ 1 box is checked (E11-S6); clears every ticked item.
    clearChecked: 'Supprimer les cases cochées',
    // One-click whole-note copy (E11-S7) — selection can't cross the per-block fields.
    copyNote: 'Copier la note',
    copyNoteDone: 'Note copiée',
    colorLabel: 'Couleur de la note',
    visibilityPublic: 'Public',
    confirmPrivateLabel: 'Confirmer le passage en privé',
    confirmPrivateText: 'Cette note ne sera plus visible par les autres.',
    lastSavedBy: 'Dernière version enregistrée par',
    lastEditedBy: 'Dernière édition par',
    history: 'Historique',
    done: 'Terminé',
    ok: 'OK',
    back: 'Retour au board',
    notFound: 'Note introuvable.',
    // Owner actions menu (E11): reuses the board pin/archive/delete wording.
    moreActions: 'Actions sur la note',
  },

  PROFILE_COPY: {
    menuEntry: 'Modifier mon nom',
    title: 'Modifier mon nom affiché',
    label: 'Nom affiché',
    save: 'Enregistrer',
    emptyName: 'Choisis un nom affiché.',
    failed: 'La modification a échoué. Réessaie dans un instant.',
  },

  LOCK_COPY: {
    mine: 'Tu modifies cette note',
    locked: (holder: string | null) =>
      `🔒 ${someone(holder)} est en cours d'édition — lecture seule`,
    available: (holder: string | null) =>
      holder === null ? 'Note disponible' : `${holder} a fini de modifier — note disponible`,
    conflict: (holder: string | null) => `${someone(holder)} modifie cette note`,
    live: 'en direct',
    readOnlyNote: (holder: string | null) =>
      `Édition indisponible tant que ${someone(holder)} modifie la note. L'affichage se met à ` +
      'jour en temps réel.',
    takeover: 'Modifier la note',
    conflictText: (holder: string | null) =>
      `${someone(holder)} a commencé à modifier cette note pendant ton absence. Tes dernières ` +
      "modifications n'ont pas pu être enregistrées.",
    goReadOnly: 'Passer en lecture seule',
  },

  HISTORY_COPY: {
    dialogLabel: 'Historique des versions',
    panelTitle: 'Historique',
    backToEditor: "Retour à l'éditeur",
    closePanel: "Fermer l'historique",
    backToEditing: "Retour à l'édition",
    versionCount: (n: number) => `${n} version${n > 1 ? 's' : ''}`,
    since: (day: string) => ` · depuis le ${day}`,
    currentBadge: 'actuelle',
    createdBy: 'Créée par',
    modifiedBy: 'Modifié par',
    restoreThis: 'Restaurer cette version',
    currentVersion: 'Version actuelle',
    previewOf: (when: string) => `Aperçu — ${when}`,
    previewBanner: 'Aperçu — lecture seule',
    versionOf: (author: string, moment: string) => `Version de ${author} · ${moment}`,
    currentMeta: (author: string) => `Version actuelle · ${author}`,
    versionMeta: (author: string) => `Version de ${author}`,
    empty: "Aucune version enregistrée pour l'instant.",
    noteNotFound: 'Note introuvable.',
    restoreConfirmLabel: 'Confirmation de restauration',
    // « Restaurer la version <day> ? » — the day keeps its own formatting.
    restoreTitleBefore: 'Restaurer la version ',
    // « La version actuelle sera <b>conservée dans l'historique</b> — … »
    restoreKeptBefore: 'La version actuelle sera ',
    restoreKeptBold: "conservée dans l'historique",
    restoreKeptAfter: (author: string, at: string) =>
      ` — rien n'est perdu. Le contenu de cette note redevient celui de ${author} ${at}.`,
    restoreFailed: 'La restauration a échoué. Réessaie.',
    restoreLocked: (holder: string) => `${holder} est en cours d'édition — réessaie plus tard.`,
  },

  ADMIN_COPY: {
    title: 'Administration',
    restricted: 'Accès réservé aux administrateurs de l’instance.',
    managerTitle: 'Gestion des accès',
    managerSubtitle: 'Seuls les e-mails autorisés peuvent créer un compte sur cette instance.',
    addPlaceholder: 'Ajouter un e-mail…',
    addLabel: 'Adresse e-mail à autoriser',
    addLong: 'Ajouter à la liste',
    addShort: 'Ajouter',
    tabMembers: 'Membres',
    tabPendingLong: 'Invités en attente',
    tabPendingShort: 'En attente',
    emptyPending: 'Aucun invité en attente — ajoute un e-mail pour autoriser un nouveau membre.',
    adminBadge: 'admin',
    statusActive: 'Actif',
    statusDisabled: 'Désactivé',
    statusPending: 'En attente',
    registeredOn: (day: string) => ` · inscrit le ${day}`,
    allowedOn: (day: string) => `Autorisé le ${day} · `,
    noAccountYet: 'pas encore de compte',
    actionsFor: (name: string) => `Actions pour ${name}`,
    promote: 'Promouvoir admin',
    demote: 'Rétrograder en membre',
    disable: 'Désactiver le compte',
    enable: 'Réactiver le compte',
    remove: 'Retirer',
  },

  NOT_FOUND_COPY: {
    title: 'Page introuvable',
    text: 'Cette page n’existe pas.',
  },

  COLOR_LABELS: {
    GOLD: 'Or',
    AVOCAT: 'Avocat',
    SALSA: 'Salsa',
    CLAY: 'Argile',
    TEAL: 'Sarcelle',
  },

  IMPORT_COPY: {
    menuEntry: 'Importer depuis Google Keep',
    title: 'Importer depuis Google Keep',

    // Upload screen
    uploadIntro:
      "Récupère d'abord tes notes auprès de Google, puis dépose l'archive ici — " +
      'tu choisiras ensuite note par note ce qui entre dans Keepou.',
    uploadSteps: [
      'Ouvre Google Takeout, ne coche que Keep, et crée l’export (format .zip).',
      'Télécharge l’archive takeout-….zip reçue par e-mail — sans la décompresser.',
      'Dépose-la ci-dessous puis Continuer.',
    ],
    takeoutUrl: 'https://takeout.google.com',
    // Step 1 with the Takeout link rendered inline: « Ouvre <a>Google Takeout</a>, … »
    step1Before: 'Ouvre ',
    step1Link: 'Google Takeout',
    step1After: ', ne coche que Keep, et crée l’export (format .zip).',
    dropLabel: 'Dépose ton export ici, ou parcourir…',
    // Rendered split so « parcourir… » carries the underline.
    dropBefore: 'Dépose ton export ici, ou ',
    dropBrowse: 'parcourir…',
    dropHint: 'Archive .zip · 20 Mo maximum',
    continue: 'Continuer',
    analyzing: 'Analyse de l’archive…',
    cancel: 'Annuler',

    // Review screen
    found: (n: number) => (n === 1 ? '1 note trouvée' : `${n} notes trouvées`),
    foundSuffix: 'dans ton export',
    unreadable: (n: number) =>
      n === 1 ? '1 fichier illisible sera ignoré' : `${n} fichiers illisibles seront ignorés`,
    privateNote: 'Les notes importées seront privées — tu pourras les rendre publiques ensuite.',
    checkAll: 'Tout cocher',
    uncheckAll: 'Tout décocher',
    trashChip: 'Corbeille',
    selectedCount: (n: number, total: number) =>
      n === 1 ? `1 sélectionnée sur ${total}` : `${n} sélectionnées sur ${total}`,
    importN: (n: number) => (n === 1 ? 'Importer la note' : `Importer les ${n} notes`),
    importing: 'Import en cours…',
    untitled: 'Note sans titre',

    // Summary screen
    imported: (n: number) => (n === 1 ? '1 note importée' : `${n} notes importées`),
    duplicates: (n: number) => (n === 1 ? '1 doublon ignoré' : `${n} doublons ignorés`),
    failedFiles: (n: number) => (n === 1 ? '1 fichier illisible' : `${n} fichiers illisibles`),
    summaryNote: "Tes notes Keep gardent leur date d'origine et restent privées.",
    seeMyNotes: 'Voir mes notes',
  },

  // MCP agent access (E13) — Personal Access Token manager, reached from the
  // account menu (« Accès agent »).
  TOKEN_COPY: {
    title: 'Accès agent (MCP)',
    adminIntro:
      'Connecte un assistant (agent IA) à Keepou via MCP — par exemple un bot ' +
      'WhatsApp ou Telegram. L’agent agit sous l’identité « Botou » et n’accède ' +
      'qu’aux notes publiques (lecture et écriture). Seuls les administrateurs ' +
      'peuvent créer ou révoquer ces jetons.',
    manage: 'Gérer les jetons',
    intro:
      'Génère un jeton pour connecter un assistant (agent IA) à Keepou via MCP. ' +
      'L’agent écrit sous le nom de « Botou » et ne touche qu’aux notes publiques.',
    endpointLabel: 'Adresse du serveur MCP',
    copyEndpoint: 'Copier l’adresse',
    nameLabel: 'Nom du jeton',
    namePlaceholder: 'Bot WhatsApp…',
    generate: 'Générer un jeton',
    generating: 'Génération…',
    emptyName: 'Donne un nom à ce jeton.',
    createFailed: 'La génération a échoué. Réessaie dans un instant.',
    // The freshly created secret, shown once.
    createdTitle: 'Copie ton jeton maintenant',
    createdWarning:
      'Ce jeton ne sera plus affiché. Copie-le et colle-le dans la configuration de ton agent.',
    copyToken: 'Copier le jeton',
    copied: 'Copié',
    doneCreating: 'J’ai copié le jeton',
    // List of existing tokens
    listTitle: 'Jetons actifs',
    empty: 'Aucun jeton pour l’instant.',
    createdOn: (day: string) => `Créé le ${day}`,
    lastUsed: (when: string) => `· utilisé ${when}`,
    neverUsed: '· jamais utilisé',
    revoke: 'Révoquer',
    revokeConfirmTitle: 'Révoquer ce jeton ?',
    revokeConfirmText:
      'L’agent qui l’utilise perdra l’accès immédiatement. Cette action est irréversible.',
    revokeFailed: 'La révocation a échoué. Réessaie dans un instant.',
    loadFailed: 'Impossible de charger les jetons. Réessaie dans un instant.',
  },
}

export type Copy = typeof fr
