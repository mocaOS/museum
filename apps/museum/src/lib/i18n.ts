const translations = {
  en: {
    // Chat UI
    askAi: "Ask AI",
    askAnything: "Ask anything...",
    deepResearchPlaceholder: "Ask a complex question for deep research...",
    chat: "Chat",
    deepResearch: "Deep Research",
    newChat: "New Chat",
    settings: "Settings",
    streamResponses: "Stream responses",
    collectionScope: "Collection scope",
    allCollections: "All collections",
    docs: "docs",
    docsCount: "{count} docs",
    thinking: "Thinking",
    steps: "steps",
    researchAreas: "Research areas:",
    relevance: "Relevance",
    rerank: "Rerank",
    emptyTitle: "Ask AI",
    emptyDescription:
      "Ask anything about your knowledge base. Switch to Deep Research for complex multi-step questions.",
    today: "Today",
    yesterday: "Yesterday",
    previous7Days: "Previous 7 Days",
    older: "Older",
    deleteChat: "Delete chat",
    untitledChat: "New Chat",
    researching: "Researching",
    searchingKnowledge: "Searching the knowledge base",
    generatingResponse: "Writing the answer",
    connecting: "Connecting",
    stillWorking: "Still working — complex questions can take a moment.",
    searchingAllCollections: "Searching across all collections",
    searchingInCollection: "Searching in:",
    loadingDocument: "Loading document…",
    stop: "Stop",
    send: "Send",
    toggleSidebar: "Toggle sidebar",
    close: "Close",
    support: "Support",
    supportUrlLabel: "Support link URL",
    supportTooltipLabel: "Support button tooltip",
    supportLinkHint:
      "Shown as a help icon in the top-right header, opens in a new tab. Leave the URL empty to hide the button. Accepts http(s):// or mailto: links.",
    errorPrefix: "Error",
    requestCancelled: "Request was cancelled.",
    unknownError: "Unknown error",

    // Auth / login
    email: "Email",
    password: "Password",
    signIn: "Sign in",
    signingIn: "Signing in…",
    signOut: "Sign out",
    loginFailed: "Sign in failed",

    // Navigation / account
    profile: "Profile",
    uploadDocuments: "Upload documents",
    admin: "Admin",
    backToChat: "← Back to chat",
    chatArrow: "Chat →",
    noGroupAssigned:
      "Your account has no group assigned. Ask an administrator to place you in a group to start chatting.",

    // Profile page
    profileHeading: "Profile",
    profileSignedInAs: "Signed in as",
    avatar: "Avatar",
    chooseImage: "Choose image",
    remove: "Remove",
    avatarHint: "PNG, JPEG, WebP or GIF. Max 2 MiB. Displayed as a square.",
    username: "Username",
    saved: "Saved.",
    saving: "Saving…",
    save: "Save",
    saveFailed: "Save failed",
    uploadFailed: "Upload failed",
    removeFailed: "Remove failed",
    currentPassword: "Current password",
    newPasswordMin: "New password (min. 8 characters)",
    changePassword: "Change password",
    passwordUpdated: "Password updated. Other sessions have been signed out.",

    // Upload page
    uploadDocumentsHeading: "Upload documents",
    uploadDescription:
      "Pick a collection and upload a document. You'll get a confirmation when the file is received. Processing happens in the background and isn't shown here.",
    noUploadPermission: "You do not have upload permission.",
    collection: "Collection",
    noCollectionsAvailable: "No collections available",
    file: "File",
    supportedFormats:
      "Documents (PDF, DOCX, XLSX, PPTX, HTML, Markdown, LaTeX, XML), images (PNG, JPG, TIFF, BMP), audio (WAV, MP3) and subtitles (VTT).",
    uploading: "Uploading…",
    upload: "Upload",
    fileUploaded: '"{name}" uploaded.',
    fileTooLarge: "File is too large. Maximum size is {max}.",

    // Admin navigation
    adminNavOverview: "Overview",
    adminNavUsers: "Users",
    adminNavGroups: "User groups",
    adminNavContentRoles: "Content roles",
    adminNavSettings: "Settings",

    // Admin: shared
    loading: "Loading…",
    failedToLoad: "Failed to load",
    cancel: "Cancel",
    edit: "Edit",
    delete: "Delete",
    actions: "Actions",
    name: "Name",
    description: "Description",
    descriptionOptional: "Description (optional)",

    // Admin dashboard
    overview: "Overview",
    overviewDescription:
      "Snapshot of system activity. Use the side nav to manage users, groups, and content roles.",
    range: "Range",
    last7Days: "Last 7 days",
    last30Days: "Last 30 days",
    last90Days: "Last 90 days",
    kpiUsers: "Users",
    kpiGroups: "Groups",
    kpiUploaders: "Uploaders",
    kpiActive: "Active",
    kpiLogins: "Logins",
    kpiMessages: "Messages",
    kpiUploads: "Uploads",
    dailyActivity: "Daily activity",
    legendMessages: "Messages",
    legendLogins: "Logins",
    legendUploads: "Uploads",
    tabTopUsers: "Top users",
    tabLoginHistory: "Login history",
    tableUser: "User",
    tableMessages: "Messages",
    tableLogins: "Logins",
    tableLastLogin: "Last login",
    noMessagesInRange: "No messages in this range.",
    deletedUser: "deleted user",
    tableWhen: "When",
    tableResult: "Result",
    tableIp: "IP",
    tableUserAgent: "User-Agent",
    noEvents: "No events.",
    resultOk: "OK",
    resultFail: "FAIL",
    showingRange: "Showing {from}–{to}",
    newer: "Newer",
    olderBtn: "Older",

    // Admin users
    usersHeading: "Users",
    usersDescription:
      "Each user signs in with their email + password and inherits the chat scope of their assigned group.",
    newUser: "New user",
    tableEmail: "Email",
    tableUsername: "Username",
    tableGroup: "Group",
    tableRole: "Role",
    roleSuperadmin: "superadmin",
    roleAdmin: "admin",
    roleUser: "user",
    roleHint:
      "Admins can create and delete regular users and manage all admin screens, but cannot manage other admin accounts.",
    lastSeen: "Last seen {when}",
    groupNone: "None",
    deleteUserConfirm: "Delete user {email}? This also deletes their chat history.",
    failedToDelete: "Failed to delete",
    editUserTitle: "Edit user — {email}",
    newUserTitle: "New user",
    saveChanges: "Save changes",
    createUser: "Create user",
    usernameOptional: "Username (optional)",
    newPasswordLeaveBlank: "New password (leave blank to keep)",
    noGroupOption: "— No group (no chat access) —",
    passwordRequiredForNew: "Password is required for new users.",

    // Admin groups
    groupsHeading: "User groups",
    groupsDescription:
      "Groups bundle users under a read-only backend key scoped to a set of collections. Each user belongs to exactly one group.",
    newGroup: "New group",
    tableMembers: "Members",
    tableCollections: "Collections",
    noGroupsYet: "No groups yet.",
    scopedCount: "{count} scoped",
    deleteGroupConfirm:
      "Delete this group? The backend API key will be revoked and members will lose chat access.",
    editGroupTitle: "Edit group — {name}",
    newGroupTitle: "New group",
    createGroup: "Create group",
    collections: "Collections",
    accessAllCollections: "Access to all collections",
    noCollectionsFromBackend:
      "No collections returned from Cortex.",
    docsBadge: "{count} docs",

    // Admin content roles
    contentRolesHeading: "Content roles",
    contentRolesDescriptionBefore:
      "Grant individual users permission to upload documents to selected collections. Each role mints a backend key with",
    contentRolesDescriptionAfter: "permission.",
    manage: "manage",
    grantRole: "Grant role",
    grantRoleTitle: "Grant content role",
    grantRoleDisabledHint:
      "No eligible users left — all non-admin users already have a content role.",
    noRolesYet: "No content roles granted yet.",
    tableGranted: "Granted",
    revoke: "Revoke",
    revokeRoleConfirm:
      "Revoke upload permission for {email}? The backend key will be deleted.",
    failedToRevoke: "Failed to revoke",
    allCollectionsLabel: "All collections",
    collectionsForUser: "Collections this user can upload to",

    // Admin settings
    settingsHeading: "Settings",
    settingsDescription:
      "Branding and default language for the chat system. Shown in the header, login page, browser tab, meta description, and the chat landing page.",
    logoLabel: "Logo",
    uploadLogo: "Upload logo",
    removeLogoConfirm:
      "Remove the custom logo and fall back to the default?",
    failedToRemove: "Failed to remove",
    logoHint:
      "SVG, PNG, JPEG, or WebP. Max 1 MiB. Wide logos render best; they appear in the header, sidebar, and on the login page.",
    accentColorLabel: "Accent color",
    accentColorHint:
      "Used for primary buttons, links, citation badges, and active states. Hex (e.g. #cba236) or any CSS color function such as oklch().",
    pageTitle: "Page title",
    pageDescription: "Page description",
    defaultLabel: "Default:",
    defaultLanguage: "Default language",
    langEnglish: "English",
    langGerman: "Deutsch (du-Form)",
    localeHint:
      "Applies to every user of the chat system. Reload required for already-open tabs.",
    resetTitleDescription: "Reset title & description",
    resetTitleDescriptionConfirm: "Reset title and description to defaults?",
    cortexAnalyticsLabel: "Cortex chat analytics",
    cortexAnalyticsHint:
      "Injected as the first entry of every backend conversation. Not visible in the chat UI. Use the variables on the right.",
    cortexAnalyticsPlaceholder:
      "<cortexchatanalytics>\nThis conversation was held by $userEmail\n</cortexchatanalytics>",
    cortexAnalyticsVariablesHeading: "Available variables",

    // Upload page tabs
    documentManagementHeading: "Document Management",
    documentManagementDescription:
      "Upload files, manage your documents, run the processing pipeline, and organize collections.",
    tabUpload: "Upload",
    tabDocuments: "Documents",
    tabProcessing: "Processing",
    tabCollections: "Collections",

    // Documents tab
    documentsHeading: "Documents",
    documentsDescription:
      "All documents in Cortex. Reprocess to rerun extraction after a config change; delete removes the document and cleans up orphaned entities.",
    tableFilename: "Filename",
    tableStatus: "Status",
    tableSource: "Source",
    tableCreated: "Created",
    reprocess: "Reprocess",
    reprocessing: "Reprocessing…",
    processPending: "Process pending",
    processingPending: "Starting…",
    noDocuments: "No documents yet. Upload a file to get started.",
    deleteDocument: "Delete document",
    deleteDocumentWarning:
      "This removes the document, its chunks, and any entities/communities that become orphaned. Type the filename to confirm.",
    deleteDocumentConfirmLabel: "Filename to confirm",
    deleting: "Deleting…",
    reprocessQueued: "Reprocess queued.",
    pendingQueued: "Pending queue started.",

    // Processing tab
    processingHeading: "Knowledge base processing",
    processingDescription:
      "Orchestrate the knowledge graph pipeline. Phase A (entity + within-doc relationships) runs automatically when a document is uploaded. Phase B (cross-document) and community detection/summarization run on demand.",
    kpiDocuments: "Documents",
    kpiChunks: "Chunks",
    kpiEntities: "Entities",
    kpiRelationships: "Relationships",
    kpiCommunities: "Communities",
    kpiPendingTasks: "Pending tasks",
    stepExtractionTitle: "Phase A — Entity extraction",
    stepExtractionDescription:
      "Runs automatically per document after upload. Use Process pending to kick off any queued documents.",
    stepRelationshipsTitle: "Phase B — Cross-document relationships",
    stepRelationshipsDescription:
      "Discovers relationships that span multiple documents. Rebuild deletes batch-analysis relationships before re-running.",
    stepCommunitiesTitle: "Communities",
    stepCommunitiesDescription:
      "Detects clusters of closely-related entities and generates LLM summaries. Run detect first, then summarize.",
    runAnalyze: "Analyze relationships",
    runRebuild: "Rebuild relationships",
    runningAnalyze: "Running…",
    runDetect: "Detect communities",
    runSummarize: "Summarize communities",
    detecting: "Detecting…",
    summarizing: "Summarizing…",
    rebuildConfirmTitle: "Rebuild relationships?",
    rebuildConfirmBody:
      "This deletes all batch-analysis relationships and re-runs cross-document discovery from scratch. Per-document relationships are preserved.",
    rebuild: "Rebuild",
    runningTasks: "Running tasks",
    noRunningTasks: "Nothing running.",
    taskStarted: "Task started.",
    taskProgress: "Progress",
    cleanupOrphaned: "Cleanup orphaned entities",
    cleanupConfirmTitle: "Cleanup orphaned entities?",
    cleanupConfirmBody:
      "Removes entities and communities that are no longer referenced by any document. Safe to run after deleting documents.",
    cleanupQueued: "Cleanup queued.",

    // Pipeline state
    phaseStatusIdle: "idle",
    phaseStatusQueued: "queued",
    phaseStatusRunning: "running",
    phaseStatusReady: "ready",
    phaseStatusFailed: "failed",
    phaseStep: "Step {n}",
    pipelineBusy: "Pipeline is busy — some actions are paused until current work finishes.",
    pipelineIdle: "Pipeline is idle.",
    tasksInPhase: "{count} task",
    tasksInPhasePlural: "{count} tasks",
    pendingDocsLabel: "{count} pending",
    otherTasks: "Other tasks",
    blockedByExtraction: "Wait for entity extraction to finish.",
    blockedByRelationships: "Wait for relationship analysis to finish.",
    blockedByCommunities: "Wait for community detection to finish.",
    blockedByPipelineBusy: "Pipeline is busy — wait for current work to finish.",
    blockedNoCommunities: "No communities detected yet — run Detect first.",
    blockedNoPending: "Nothing pending.",
    blockedDocProcessing: "Document is still processing.",
    processingStartedHint: "Processing starts in the background. Track progress in the Processing tab.",

    // Collections tab
    collectionsHeading: "Collections",
    collectionsDescription:
      "Create and manage collections in Cortex. Deleting a collection unlinks its documents but the documents themselves are preserved.",
    newCollection: "New collection",
    newCollectionTitle: "New collection",
    createCollection: "Create collection",
    renameCollectionTitle: "Rename collection",
    noCollectionsYet: "No collections yet.",
    tableDocuments: "Documents",
    rename: "Rename",
    deleteCollectionTitle: "Delete collection",
    deleteCollectionWarning:
      "{count} documents will be unlinked from this collection. Documents themselves are preserved and can be reassigned. Type the collection name to confirm.",
    deleteCollectionEmptyBody:
      "This collection has no documents. Type the collection name to confirm.",
    deleteCollectionConfirmLabel: "Collection name to confirm",
    collectionCreated: "Collection created.",
    collectionRenamed: "Collection renamed.",
    collectionDeleted: "Collection deleted.",
  },
  de: {
    // Chat UI
    askAi: "KI fragen",
    askAnything: "Frag etwas...",
    deepResearchPlaceholder: "Stelle eine komplexe Frage für Deep Research...",
    chat: "Chat",
    deepResearch: "Deep Research",
    newChat: "Neuer Chat",
    settings: "Einstellungen",
    streamResponses: "Antworten streamen",
    collectionScope: "Sammlungsbereich",
    allCollections: "Alle Sammlungen",
    docs: "Dok.",
    docsCount: "{count} Dok.",
    thinking: "Denkt nach",
    steps: "Schritte",
    researchAreas: "Recherchebereiche:",
    relevance: "Relevanz",
    rerank: "Rerank",
    emptyTitle: "KI fragen",
    emptyDescription:
      "Stelle deine Fragen an die Knowledge Base. Wechsle zu Deep Research für komplexere Anfragen.",
    today: "Heute",
    yesterday: "Gestern",
    previous7Days: "Letzte 7 Tage",
    older: "Älter",
    deleteChat: "Chat löschen",
    untitledChat: "Neuer Chat",
    researching: "Recherchiert",
    searchingKnowledge: "Durchsucht die Wissensdatenbank",
    generatingResponse: "Schreibt die Antwort",
    connecting: "Verbindet",
    stillWorking: "Arbeitet noch — komplexe Fragen können einen Moment dauern.",
    searchingAllCollections: "Suche in allen Sammlungen",
    searchingInCollection: "Suche in:",
    loadingDocument: "Dokument wird geladen…",
    stop: "Stoppen",
    send: "Senden",
    toggleSidebar: "Seitenleiste umschalten",
    close: "Schließen",
    support: "Support",
    supportUrlLabel: "Support-Link URL",
    supportTooltipLabel: "Tooltip des Support-Buttons",
    supportLinkHint:
      "Wird als Hilfe-Symbol oben rechts angezeigt und öffnet sich in einem neuen Tab. Lass die URL leer, um den Button auszublenden. Erlaubt http(s):// oder mailto:-Links.",
    errorPrefix: "Fehler",
    requestCancelled: "Anfrage wurde abgebrochen.",
    unknownError: "Unbekannter Fehler",

    // Auth / login
    email: "E-Mail",
    password: "Passwort",
    signIn: "Anmelden",
    signingIn: "Melde an…",
    signOut: "Abmelden",
    loginFailed: "Anmeldung fehlgeschlagen",

    // Navigation / account
    profile: "Profil",
    uploadDocuments: "Dokumente hochladen",
    admin: "Admin",
    backToChat: "← Zurück zum Chat",
    chatArrow: "Chat →",
    noGroupAssigned:
      "Deinem Konto ist keine Gruppe zugewiesen. Bitte einen Administrator, dich einer Gruppe hinzuzufügen, um zu chatten.",

    // Profile page
    profileHeading: "Profil",
    profileSignedInAs: "Angemeldet als",
    avatar: "Avatar",
    chooseImage: "Bild auswählen",
    remove: "Entfernen",
    avatarHint: "PNG, JPEG, WebP oder GIF. Max. 2 MiB. Wird quadratisch angezeigt.",
    username: "Benutzername",
    saved: "Gespeichert.",
    saving: "Speichert…",
    save: "Speichern",
    saveFailed: "Speichern fehlgeschlagen",
    uploadFailed: "Upload fehlgeschlagen",
    removeFailed: "Entfernen fehlgeschlagen",
    currentPassword: "Aktuelles Passwort",
    newPasswordMin: "Neues Passwort (mind. 8 Zeichen)",
    changePassword: "Passwort ändern",
    passwordUpdated: "Passwort aktualisiert. Andere Sitzungen wurden abgemeldet.",

    // Upload page
    uploadDocumentsHeading: "Dokumente hochladen",
    uploadDescription:
      "Wähle eine Sammlung und lade ein Dokument hoch. Du bekommst eine Bestätigung, sobald die Datei empfangen wurde. Die Verarbeitung läuft im Hintergrund und wird hier nicht angezeigt.",
    noUploadPermission: "Du hast keine Berechtigung zum Hochladen.",
    collection: "Sammlung",
    noCollectionsAvailable: "Keine Sammlungen verfügbar",
    file: "Datei",
    supportedFormats:
      "Dokumente (PDF, DOCX, XLSX, PPTX, HTML, Markdown, LaTeX, XML), Bilder (PNG, JPG, TIFF, BMP), Audio (WAV, MP3) und Untertitel (VTT).",
    uploading: "Lädt hoch…",
    upload: "Hochladen",
    fileUploaded: '„{name}" hochgeladen.',
    fileTooLarge: "Die Datei ist zu groß. Maximalgröße ist {max}.",

    // Admin navigation
    adminNavOverview: "Übersicht",
    adminNavUsers: "Benutzer",
    adminNavGroups: "Benutzergruppen",
    adminNavContentRoles: "Inhaltsrollen",
    adminNavSettings: "Einstellungen",

    // Admin: shared
    loading: "Lädt…",
    failedToLoad: "Laden fehlgeschlagen",
    cancel: "Abbrechen",
    edit: "Bearbeiten",
    delete: "Löschen",
    actions: "Aktionen",
    name: "Name",
    description: "Beschreibung",
    descriptionOptional: "Beschreibung (optional)",

    // Admin dashboard
    overview: "Übersicht",
    overviewDescription:
      "Überblick über die Systemaktivität. Nutze die Seitennavigation, um Benutzer, Gruppen und Inhaltsrollen zu verwalten.",
    range: "Zeitraum",
    last7Days: "Letzte 7 Tage",
    last30Days: "Letzte 30 Tage",
    last90Days: "Letzte 90 Tage",
    kpiUsers: "Benutzer",
    kpiGroups: "Gruppen",
    kpiUploaders: "Uploader",
    kpiActive: "Aktiv",
    kpiLogins: "Logins",
    kpiMessages: "Nachrichten",
    kpiUploads: "Uploads",
    dailyActivity: "Tägliche Aktivität",
    legendMessages: "Nachrichten",
    legendLogins: "Logins",
    legendUploads: "Uploads",
    tabTopUsers: "Top-Benutzer",
    tabLoginHistory: "Login-Verlauf",
    tableUser: "Benutzer",
    tableMessages: "Nachrichten",
    tableLogins: "Logins",
    tableLastLogin: "Letzter Login",
    noMessagesInRange: "Keine Nachrichten in diesem Zeitraum.",
    deletedUser: "Gelöschter Benutzer",
    tableWhen: "Wann",
    tableResult: "Ergebnis",
    tableIp: "IP",
    tableUserAgent: "User-Agent",
    noEvents: "Keine Ereignisse.",
    resultOk: "OK",
    resultFail: "FAIL",
    showingRange: "Zeige {from}–{to}",
    newer: "Neuer",
    olderBtn: "Älter",

    // Admin users
    usersHeading: "Benutzer",
    usersDescription:
      "Jeder Benutzer meldet sich mit seiner E-Mail + Passwort an und erbt den Chat-Bereich seiner zugewiesenen Gruppe.",
    newUser: "Neuer Benutzer",
    tableEmail: "E-Mail",
    tableUsername: "Benutzername",
    tableGroup: "Gruppe",
    tableRole: "Rolle",
    roleSuperadmin: "superadmin",
    roleAdmin: "admin",
    roleUser: "user",
    roleHint:
      "Admins können reguläre Benutzer anlegen und löschen sowie alle Admin-Screens verwalten, jedoch keine anderen Admin-Konten.",
    lastSeen: "Zuletzt gesehen {when}",
    groupNone: "Keine",
    deleteUserConfirm:
      "Benutzer {email} löschen? Dadurch wird auch der Chatverlauf gelöscht.",
    failedToDelete: "Löschen fehlgeschlagen",
    editUserTitle: "Benutzer bearbeiten — {email}",
    newUserTitle: "Neuer Benutzer",
    saveChanges: "Änderungen speichern",
    createUser: "Benutzer anlegen",
    usernameOptional: "Benutzername (optional)",
    newPasswordLeaveBlank: "Neues Passwort (leer lassen zum Beibehalten)",
    noGroupOption: "— Keine Gruppe (kein Chat-Zugriff) —",
    passwordRequiredForNew: "Für neue Benutzer ist ein Passwort erforderlich.",

    // Admin groups
    groupsHeading: "Benutzergruppen",
    groupsDescription:
      "Gruppen bündeln Benutzer unter einem nur-Lesen Backend-Key, der auf eine Menge von Sammlungen beschränkt ist. Jeder Benutzer gehört genau einer Gruppe an.",
    newGroup: "Neue Gruppe",
    tableMembers: "Mitglieder",
    tableCollections: "Sammlungen",
    noGroupsYet: "Noch keine Gruppen.",
    scopedCount: "{count} zugewiesen",
    deleteGroupConfirm:
      "Diese Gruppe löschen? Der Backend-API-Key wird widerrufen und Mitglieder verlieren den Chat-Zugang.",
    editGroupTitle: "Gruppe bearbeiten — {name}",
    newGroupTitle: "Neue Gruppe",
    createGroup: "Gruppe anlegen",
    collections: "Sammlungen",
    accessAllCollections: "Zugriff auf alle Sammlungen",
    noCollectionsFromBackend:
      "Cortex hat keine Sammlungen zurückgegeben.",
    docsBadge: "{count} Dok.",

    // Admin content roles
    contentRolesHeading: "Inhaltsrollen",
    contentRolesDescriptionBefore:
      "Erteile einzelnen Benutzern die Berechtigung, Dokumente in ausgewählte Sammlungen hochzuladen. Jede Rolle erstellt einen Backend-Key mit",
    contentRolesDescriptionAfter: "Berechtigung.",
    manage: "manage",
    grantRole: "Rolle erteilen",
    grantRoleTitle: "Inhaltsrolle erteilen",
    grantRoleDisabledHint:
      "Keine berechtigten Benutzer mehr — alle Nicht-Admin-Benutzer haben bereits eine Inhaltsrolle.",
    noRolesYet: "Noch keine Inhaltsrollen erteilt.",
    tableGranted: "Erteilt",
    revoke: "Widerrufen",
    revokeRoleConfirm:
      "Upload-Berechtigung für {email} widerrufen? Der Backend-Key wird gelöscht.",
    failedToRevoke: "Widerrufen fehlgeschlagen",
    allCollectionsLabel: "Alle Sammlungen",
    collectionsForUser: "Sammlungen, in die dieser Benutzer hochladen darf",

    // Admin settings
    settingsHeading: "Einstellungen",
    settingsDescription:
      "Branding und Standardsprache für das Chat-System. Wird im Header, auf der Login-Seite, im Browser-Tab, in der Meta-Beschreibung und auf der Chat-Startseite angezeigt.",
    logoLabel: "Logo",
    uploadLogo: "Logo hochladen",
    removeLogoConfirm:
      "Benutzerdefiniertes Logo entfernen und auf den Standard zurücksetzen?",
    failedToRemove: "Entfernen fehlgeschlagen",
    logoHint:
      "SVG, PNG, JPEG oder WebP. Max. 1 MiB. Breite Logos werden am besten dargestellt; sie erscheinen im Header, in der Seitenleiste und auf der Login-Seite.",
    accentColorLabel: "Akzentfarbe",
    accentColorHint:
      "Wird für Primärbuttons, Links, Quellen-Badges und aktive Zustände verwendet. Hex (z. B. #cba236) oder beliebige CSS-Farbfunktion wie oklch().",
    pageTitle: "Seitentitel",
    pageDescription: "Seitenbeschreibung",
    defaultLabel: "Standard:",
    defaultLanguage: "Standardsprache",
    langEnglish: "English",
    langGerman: "Deutsch (du-Form)",
    localeHint:
      "Gilt für alle Benutzer des Chat-Systems. Bereits geöffnete Tabs müssen neu geladen werden.",
    resetTitleDescription: "Titel & Beschreibung zurücksetzen",
    resetTitleDescriptionConfirm:
      "Titel und Beschreibung auf Standard zurücksetzen?",
    cortexAnalyticsLabel: "Cortex Chat Analytics",
    cortexAnalyticsHint:
      "Wird als erster Eintrag jeder Backend-Konversation eingefügt. Wird nicht im Chat-UI angezeigt. Nutze die Variablen rechts.",
    cortexAnalyticsPlaceholder:
      "<cortexchatanalytics>\nDiese Konversation wurde geführt von $userEmail\n</cortexchatanalytics>",
    cortexAnalyticsVariablesHeading: "Verfügbare Variablen",

    // Upload page tabs
    documentManagementHeading: "Dokumentenverwaltung",
    documentManagementDescription:
      "Dateien hochladen, deine Dokumente verwalten, die Verarbeitungspipeline steuern und Sammlungen organisieren.",
    tabUpload: "Upload",
    tabDocuments: "Dokumente",
    tabProcessing: "Verarbeitung",
    tabCollections: "Sammlungen",

    // Documents tab
    documentsHeading: "Dokumente",
    documentsDescription:
      "Alle Dokumente in Cortex. Mit Reprocess kannst du die Extraktion nach einer Konfigurationsänderung erneut ausführen; Löschen entfernt das Dokument und räumt verwaiste Entities auf.",
    tableFilename: "Dateiname",
    tableStatus: "Status",
    tableSource: "Quelle",
    tableCreated: "Erstellt",
    reprocess: "Reprocess",
    reprocessing: "Reprocessing…",
    processPending: "Ausstehende verarbeiten",
    processingPending: "Starte…",
    noDocuments: "Noch keine Dokumente. Lade eine Datei hoch.",
    deleteDocument: "Dokument löschen",
    deleteDocumentWarning:
      "Das Dokument, seine Chunks und alle dadurch verwaisten Entities/Communities werden entfernt. Gib den Dateinamen zur Bestätigung ein.",
    deleteDocumentConfirmLabel: "Dateiname zur Bestätigung",
    deleting: "Lösche…",
    reprocessQueued: "Reprocess in Warteschlange.",
    pendingQueued: "Ausstehende Verarbeitung gestartet.",

    // Processing tab
    processingHeading: "Knowledge Base Verarbeitung",
    processingDescription:
      "Steuere die Knowledge-Graph-Pipeline. Phase A (Entities + dokumentinterne Relationen) läuft automatisch beim Upload. Phase B (dokumentübergreifend) und Community-Erkennung/-Zusammenfassung werden manuell ausgelöst.",
    kpiDocuments: "Dokumente",
    kpiChunks: "Chunks",
    kpiEntities: "Entities",
    kpiRelationships: "Relationen",
    kpiCommunities: "Communities",
    kpiPendingTasks: "Offene Tasks",
    stepExtractionTitle: "Phase A — Entity-Extraktion",
    stepExtractionDescription:
      'Läuft automatisch pro Dokument nach dem Upload. Mit „Ausstehende verarbeiten" startest du die Warteschlange manuell.',
    stepRelationshipsTitle: "Phase B — Dokumentübergreifende Relationen",
    stepRelationshipsDescription:
      "Findet Relationen über mehrere Dokumente hinweg. Rebuild löscht die bisherigen Batch-Relationen und startet neu.",
    stepCommunitiesTitle: "Communities",
    stepCommunitiesDescription:
      "Erkennt Cluster eng verbundener Entities und erzeugt LLM-Zusammenfassungen. Erst Detect, dann Summarize ausführen.",
    runAnalyze: "Relationen analysieren",
    runRebuild: "Relationen neu aufbauen",
    runningAnalyze: "Läuft…",
    runDetect: "Communities erkennen",
    runSummarize: "Communities zusammenfassen",
    detecting: "Erkenne…",
    summarizing: "Fasse zusammen…",
    rebuildConfirmTitle: "Relationen neu aufbauen?",
    rebuildConfirmBody:
      "Dabei werden alle Batch-Relationen gelöscht und die dokumentübergreifende Analyse läuft komplett neu. Dokumentinterne Relationen bleiben erhalten.",
    rebuild: "Neu aufbauen",
    runningTasks: "Laufende Tasks",
    noRunningTasks: "Nichts läuft gerade.",
    taskStarted: "Task gestartet.",
    taskProgress: "Fortschritt",
    cleanupOrphaned: "Verwaiste Entities aufräumen",
    cleanupConfirmTitle: "Verwaiste Entities aufräumen?",
    cleanupConfirmBody:
      "Entfernt Entities und Communities, auf die kein Dokument mehr verweist. Sinnvoll nach dem Löschen von Dokumenten.",
    cleanupQueued: "Aufräumen in Warteschlange.",

    // Pipeline state
    phaseStatusIdle: "leer",
    phaseStatusQueued: "wartet",
    phaseStatusRunning: "läuft",
    phaseStatusReady: "bereit",
    phaseStatusFailed: "fehlgeschlagen",
    phaseStep: "Schritt {n}",
    pipelineBusy: "Pipeline ist beschäftigt — einige Aktionen sind pausiert, bis der aktuelle Vorgang beendet ist.",
    pipelineIdle: "Pipeline ist im Leerlauf.",
    tasksInPhase: "{count} Task",
    tasksInPhasePlural: "{count} Tasks",
    pendingDocsLabel: "{count} ausstehend",
    otherTasks: "Weitere Tasks",
    blockedByExtraction: "Warte, bis die Entity-Extraktion beendet ist.",
    blockedByRelationships: "Warte, bis die Relationen-Analyse beendet ist.",
    blockedByCommunities: "Warte, bis die Community-Erkennung beendet ist.",
    blockedByPipelineBusy: "Pipeline ist beschäftigt — warte, bis die aktuelle Arbeit beendet ist.",
    blockedNoCommunities: "Noch keine Communities erkannt — starte zuerst Detect.",
    blockedNoPending: "Nichts in der Warteschlange.",
    blockedDocProcessing: "Dokument wird noch verarbeitet.",
    processingStartedHint:
      "Die Verarbeitung läuft im Hintergrund. Verfolge den Fortschritt im Tab „Verarbeitung“.",

    // Collections tab
    collectionsHeading: "Sammlungen",
    collectionsDescription:
      "Sammlungen in Cortex anlegen und verwalten. Beim Löschen einer Sammlung werden ihre Dokumente entkoppelt, aber die Dokumente selbst bleiben erhalten.",
    newCollection: "Neue Sammlung",
    newCollectionTitle: "Neue Sammlung",
    createCollection: "Sammlung anlegen",
    renameCollectionTitle: "Sammlung umbenennen",
    noCollectionsYet: "Noch keine Sammlungen.",
    tableDocuments: "Dokumente",
    rename: "Umbenennen",
    deleteCollectionTitle: "Sammlung löschen",
    deleteCollectionWarning:
      "{count} Dokumente werden von dieser Sammlung entkoppelt. Die Dokumente selbst bleiben erhalten und können neu zugeordnet werden. Gib den Sammlungsnamen zur Bestätigung ein.",
    deleteCollectionEmptyBody:
      "Diese Sammlung enthält keine Dokumente. Gib den Sammlungsnamen zur Bestätigung ein.",
    deleteCollectionConfirmLabel: "Sammlungsname zur Bestätigung",
    collectionCreated: "Sammlung angelegt.",
    collectionRenamed: "Sammlung umbenannt.",
    collectionDeleted: "Sammlung gelöscht.",
  },
} as const;

export type Locale = keyof typeof translations;
export type TranslationKey = keyof (typeof translations)["en"];

let currentLocale: Locale = "en";
const listeners = new Set<() => void>();

export function setLocale(locale: Locale) {
  if (currentLocale === locale) return;
  currentLocale = locale;
  listeners.forEach((fn) => fn());
}

export function getLocale(): Locale {
  return currentLocale;
}

export function t(
  key: TranslationKey,
  vars?: Record<string, string | number>
): string {
  const raw =
    (translations[currentLocale] as Record<string, string>)[key] ||
    (translations.en as Record<string, string>)[key] ||
    key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name) =>
    name in vars ? String(vars[name]) : `{${name}}`
  );
}

export function __subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
