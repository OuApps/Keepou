/**
 * Centralized French UI copy — started with the Import flow (E10-S3); the
 * older screens' strings migrate here with E8's i18n pass. The wording is
 * frozen in `design/HANDOFF.md` §7 — change it there first, then here.
 */

export const IMPORT_COPY = {
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
  dropLabel: 'Dépose ton export ici, ou parcourir…',
  dropHint: 'Archive .zip · 20 Mo maximum',
  uploadNote: "Aucune note n'est créée à cette étape — tu passes d'abord en revue.",
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
} as const
