const { Plugin, ItemView, WorkspaceLeaf, Setting, PluginSettingTab, Notice, TFolder, TFile, MarkdownRenderer, debounce, setIcon, FuzzySuggestModal, moment, Keymap, AbstractInputSuggest, requireApiVersion } = require('obsidian');

/* =============
CONSTANTS & DEFAULTS
============= */

const VIEW_TYPE = 'writing-manager-plus-view';
const MARKDOWN_EXTENSION = 'md';
const ASK_EVERY_TIME = 'ASK_EVERY_TIME';
const TAB_ID_FILES = 'files';
const TAB_ID_FOLDERS = 'folders';

const DEFAULT_SETTINGS = {
    paneLayout: 'left-to-right',
    baseFolderPath: '/',
    currentFolderPath: '/',
    compileOutputPath: '/',
    includeSubfolderFiles: false,
    metadataDisplayDefaultCollapsed: true,
    enableFolderRepresentativeNotes: true,
    folderRepresentativeNoteFilename: '{{folder_name}}.md',
    fileOrder: {},
    folderOrder: {},
    statuses: [],
    completionStatusName: '',
    metadataFields: [
        { name: 'tagline', isTagline: true }
    ],
};

/* =============
I18N (INTERNATIONALIZATION)
============= */

let translations = {};
const t = (key, vars) => {
    const navigate = (pack, keyPath) => keyPath.split('.').reduce((o, i) => (o && typeof o[i] !== 'undefined' ? o[i] : undefined), pack);
    const lang = moment.locale();
    const fallbackPack = translations['en'] || {};
    const currentPack = translations[lang] || fallbackPack;
    let text = navigate(currentPack, key) ?? navigate(fallbackPack, key);
    if (typeof text === 'string' && vars) {
        for (const varKey in vars) {
            text = text.replace(new RegExp(`\\$\\{${varKey}\\}`, 'g'), vars[varKey]);
        }
    }
    return text || key;
};

async function loadTranslations(plugin) {
    const supportedLanguages = ['en', 'ko'];
    const loadLang = async (lang) => {
        try {
            const langFile = await plugin.app.vault.adapter.read(`${plugin.manifest.dir}/lang/${lang}.json`);
            translations[lang] = JSON.parse(langFile);
        } catch (e) {
            console.error(`[Writing Manager +] Could not load language file for ${lang}`, e);
        }
    };
    await loadLang('en');
    const currentLang = moment.locale();
    if (currentLang !== 'en' && supportedLanguages.includes(currentLang)) {
        await loadLang(currentLang);
    }
}

/* =============
UTILITY FUNCTIONS
============= */

function getFolderRepresentativeNote(plugin, folderPath) {
    if (!plugin.settings.enableFolderRepresentativeNotes) return null;

    const folder = plugin.app.vault.getAbstractFileByPath(folderPath);
    if (!(folder instanceof TFolder)) return null;

    const filenamePattern = plugin.settings.folderRepresentativeNoteFilename || '{{folder_name}}.md';
    const filename = filenamePattern.replace('{{folder_name}}', folder.name);
    
    const notePath = folder.isRoot() ? filename : `${folder.path}/${filename}`;
    const noteFile = plugin.app.vault.getAbstractFileByPath(notePath);
    
    return noteFile instanceof TFile ? noteFile : null;
}

async function collectFilesRecursively(folder) {
    const files = [];
    for (const child of folder.children) {
        if (child instanceof TFolder) {
            files.push(...(await collectFilesRecursively(child)));
        } else if (child instanceof TFile && child.extension === MARKDOWN_EXTENSION) {
            files.push(child);
        }
    }
    return files;
}

async function collectFoldersRecursively(folder) {
    const folders = [];
    for (const child of folder.children) {
        if (child instanceof TFolder) {
            folders.push(child);
            folders.push(...(await collectFoldersRecursively(child)));
        }
    }
    return folders;
}

/* =============
UI COMPONENTS
============= */

/* FolderSuggestModal */
class FolderSuggestModal extends FuzzySuggestModal {
    constructor(app, onChoose) {
        super(app);
        this.onChoose = onChoose;
    }
    getItems() {
        return this.app.vault.getAllLoadedFiles().filter(f => f instanceof TFolder);
    }
    getItemText(folder) {
        return folder.path;
    }
    onChooseItem(folder, evt) {
        this.onChoose(folder.path);
    }
}

/* LinkSuggest */
class LinkSuggest extends AbstractInputSuggest {
    constructor(app, inputEl) {
        super(app, inputEl);
        this.app = app;
        this.inputEl = inputEl;
        this.suggestEl.addClasses(['mod-property-value', 'wmp-suggestion-container']);
    }

    getSuggestions(query) {
        const cursorPosition = this.inputEl.selectionStart;
        const textBeforeCursor = query.substring(0, cursorPosition);
        const lastOpenBracket = textBeforeCursor.lastIndexOf('[[');

        if (lastOpenBracket === -1) return [];

        const afterLastOpenBracket = textBeforeCursor.substring(lastOpenBracket);
        if (afterLastOpenBracket.includes(']]')) return [];
        
        const subquery = afterLastOpenBracket.substring(2).toLowerCase();
        const allFiles = this.app.vault.getMarkdownFiles();

        if (subquery.trim() === '') {
            return allFiles
                .sort((a, b) => b.stat.mtime - a.stat.mtime)
                .slice(0, 10);
        }

        return allFiles.filter(file => file.basename.toLowerCase().includes(subquery));
    }

    renderSuggestion(file, el) {
        el.empty();
        el.addClass('mod-complex');
        const content = el.createDiv({ cls: 'suggestion-content' });
        content.createDiv({ cls: 'suggestion-title', text: file.basename });
        if (file.parent && file.parent.path) {
            content.createDiv({ cls: 'suggestion-note', text: file.parent.path });
        }
    }

    selectSuggestion(file, evt) {
        const cursorPosition = this.inputEl.selectionStart;
        const originalText = this.inputEl.value;
        const textBeforeCursor = originalText.substring(0, cursorPosition);
        const lastOpenBracket = textBeforeCursor.lastIndexOf('[[');

        if (lastOpenBracket !== -1) {
            const prefix = originalText.substring(0, lastOpenBracket);
            const suffix = originalText.substring(this.inputEl.selectionEnd);
            this.inputEl.value = `${prefix}[[${file.basename}]]${suffix}`;
            const newCursorPosition = prefix.length + `[[${file.basename}]]`.length;
            this.inputEl.setSelectionRange(newCursorPosition, newCursorPosition);
            this.close();
        }
    }
}

/* WritingManagerPlusSettingTab */
class WritingManagerPlusSettingTab extends PluginSettingTab {

    activeTab = 'default';

    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    // Display & Tab Logic
    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.addClass('wmp-settings-layout');

        this.createTabs(containerEl);
    }

    createTabs(containerEl) {
        const header = containerEl.createDiv({ cls: 'wmp-tabs-header' });
        const tabBar = header.createDiv({ cls: 'wmp-tabs-bar' });
        const contentContainer = containerEl.createDiv({ cls: 'setting-tab-content' });

        const tabs = [
            { id: 'default', name: t('settings.default.title'), icon: 'sliders-horizontal', render: this._renderDefaultSettings.bind(this) },
            { id: 'display', name: t('settings.metadata.title'), icon: 'tags', render: this._renderDisplaySettings.bind(this) },
            { id: 'status', name: t('settings.status.title'), icon: 'flag', render: this._renderStatusSettings.bind(this) },
            { id: 'compilation', name: t('settings.compilation.title'), icon: 'combine', render: this._renderCompilationSettings.bind(this) },
            { id: 'addon', name: t('settings.addon.title'), icon: 'puzzle', render: this._renderAddonSettings.bind(this) },
            { id: 'help', name: t('settings.help.title'), icon: 'help-circle', render: this._renderHelpTab.bind(this) },
        ];

        tabs.forEach(tab => {
            const navItem = tabBar.createEl('div', { cls: 'wmp-tabs-button' });
            setIcon(navItem, tab.icon);
            navItem.createSpan({ text: tab.name });
            if (this.activeTab === tab.id) navItem.addClass('is-active');
            navItem.addEventListener('click', () => {
                this.activeTab = tab.id;
                this.display();
            });
        });

        const activeTabContent = tabs.find(tab => tab.id === this.activeTab);
        if (activeTabContent) {
            activeTabContent.render(contentContainer);
        }
    }

    // Settings Panes
    _renderDefaultSettings(containerEl) {
        new Setting(containerEl).setHeading().setName(t('settings.default.title'));
        
        new Setting(containerEl)
            .setName(t('settings.default.basePath.name'))
            .setDesc(t('settings.default.basePath.desc'))
            .addDropdown(dropdown => {
                const folders = this.app.vault.getAllLoadedFiles().filter(f => f instanceof TFolder);
                folders.forEach(folder => dropdown.addOption(folder.path, folder.isRoot() ? '/' : folder.path));
                dropdown.setValue(this.plugin.settings.baseFolderPath).onChange(async (value) => {
                    await this.plugin.updateSetting('baseFolderPath', value);
                    await this.plugin.updateSetting('currentFolderPath', value, true);
                    this.display();
                });
            });

        new Setting(containerEl)
            .setName(t('settings.default.paneLayout.name'))
            .setDesc(t('settings.default.paneLayout.desc'))
            .addDropdown(dropdown => dropdown
                .addOption('left-to-right', t('settings.default.paneLayout.ltr'))
                .addOption('right-to-left', t('settings.default.paneLayout.rtl'))
                .setValue(this.plugin.settings.paneLayout).onChange((value) => this.plugin.updateSetting('paneLayout', value, true)));
        
        new Setting(containerEl)
            .setName(t('settings.default.collapseMetadata.name'))
            .setDesc(t('settings.default.collapseMetadata.desc'))
            .addToggle(toggle => toggle.setValue(this.plugin.settings.metadataDisplayDefaultCollapsed).onChange((value) => this.plugin.updateSetting('metadataDisplayDefaultCollapsed', value, true)));
    }

    _renderDisplaySettings(containerEl) {
        new Setting(containerEl).setHeading().setName(t('settings.metadata.title'));
        containerEl.createEl('p', { text: t('settings.metadata.desc'), cls: 'setting-item-description' });

        this.plugin.settings.metadataFields.forEach((field, index) => {
            const setting = new Setting(containerEl)
                .addText(text => text
                    .setPlaceholder(t('settings.metadata.field.namePlaceholder'))
                    .setValue(field.name)
                    .onChange(debounce(async (value) => {
                        this.plugin.settings.metadataFields[index].name = value.trim();
                        await this.plugin.updateSetting('metadataFields', this.plugin.settings.metadataFields, true);
                    }, 500, true)))
                .addExtraButton(button => {
                    button.setIcon('pin').setTooltip(t('settings.metadata.field.taglineTooltip'));
                    if (field.isTagline) button.extraSettingsEl.addClass('is-active');
                    
                    button.onClick(async () => {
                        const isCurrentlyTagline = this.plugin.settings.metadataFields[index].isTagline;
                        this.plugin.settings.metadataFields.forEach(f => f.isTagline = false);
                        if (!isCurrentlyTagline) {
                            this.plugin.settings.metadataFields[index].isTagline = true;
                        }
                        await this.plugin.updateSetting('metadataFields', this.plugin.settings.metadataFields, true);
                        this.display();
                    });
                })
                .addExtraButton(button => button
                    .setIcon('trash')
                    .setTooltip(t('settings.metadata.field.delete'))
                    .onClick(async () => {
                        this.plugin.settings.metadataFields.splice(index, 1);
                        await this.plugin.updateSetting('metadataFields', this.plugin.settings.metadataFields, true);
                        this.display();
                    }));
            setting.controlEl.addClass("wmp-metadata-setting-control");
        });

        new Setting(containerEl)
            .addButton(button => button
                .setButtonText(t('settings.metadata.add'))
                .setCta()
                .onClick(async () => {
                    this.plugin.settings.metadataFields.push({ name: '', isTagline: false });
                    await this.plugin.updateSetting('metadataFields', this.plugin.settings.metadataFields, false);
                    this.display();
                }));
    }

    _renderStatusSettings(containerEl) {
        new Setting(containerEl).setHeading().setName(t('settings.status.title'));

        this.plugin.settings.statuses.forEach((status, index) => {
            const setting = new Setting(containerEl)
                .addText(text => text
                    .setPlaceholder(t('settings.status.statusEntry.placeholder'))
                    .setValue(status.name)
                    .onChange(async (value) => {
                        const oldName = this.plugin.settings.statuses[index].name;
                        const newName = value.trim();

                        if (this.plugin.settings.statuses.some((s, i) => s.name === newName && i !== index)) {
                            new Notice(t('settings.status.duplicateError', { name: newName }));
                            text.setValue(oldName);
                            return;
                        }

                        this.plugin.settings.statuses[index].name = newName;
                        if (this.plugin.settings.completionStatusName === oldName) {
                            this.plugin.settings.completionStatusName = newName;
                        }
                        await this.plugin.updateSetting('statuses', this.plugin.settings.statuses, true);
                        this.display();
                    }))
                .addColorPicker(color => color
                    .setValue(status.color)
                    .onChange(async (value) => {
                        this.plugin.settings.statuses[index].color = value;
                        await this.plugin.updateSetting('statuses', this.plugin.settings.statuses, true);
                    }))
                .addExtraButton(button => button
                    .setIcon('trash')
                    .setTooltip(t('settings.status.statusEntry.delete'))
                    .onClick(async () => {
                        this.plugin.settings.statuses.splice(index, 1);
                        await this.plugin.updateSetting('statuses', this.plugin.settings.statuses, true);
                        this.display();
                    }));
            setting.controlEl.addClass("wmp-status-setting-control");
        });
        new Setting(containerEl)
            .addButton(button => button
                .setButtonText(t('settings.status.add'))
                .setCta()
                .onClick(async () => {
                    this.plugin.settings.statuses.push({ key: `custom-${Date.now()}`, name: t('settings.status.newStatusName'), color: '#888888' });
                    await this.plugin.updateSetting('statuses', this.plugin.settings.statuses, true);
                    this.display();
                }));
    }
    
    _renderCompilationSettings(containerEl) {
        new Setting(containerEl).setHeading().setName(t('settings.compilation.title'));

        new Setting(containerEl)
            .setName(t('settings.compilation.includeSubfolders.name'))
            .setDesc(t('settings.compilation.includeSubfolders.desc'))
            .addToggle(toggle => toggle.setValue(this.plugin.settings.includeSubfolderFiles).onChange((value) => this.plugin.updateSetting('includeSubfolderFiles', value, true)));

        new Setting(containerEl)
            .setName(t('settings.compilation.compilePath.name'))
            .setDesc(t('settings.compilation.compilePath.desc'))
            .addDropdown(dropdown => {
                dropdown.addOption(ASK_EVERY_TIME, t('settings.compilation.compilePath.askOption'));
                const folders = this.app.vault.getAllLoadedFiles().filter(f => f instanceof TFolder);
                folders.forEach(folder => dropdown.addOption(folder.path, folder.isRoot() ? '/' : folder.path));
                dropdown.setValue(this.plugin.settings.compileOutputPath).onChange((value) => this.plugin.updateSetting('compileOutputPath', value));
            });
            
        new Setting(containerEl)
            .setName(t('settings.compilation.completionStatus.name'))
            .setDesc(t('settings.compilation.completionStatus.desc'))
            .addDropdown(dropdown => {
                this.plugin.settings.statuses.map(s => s.name).filter(Boolean).forEach(name => dropdown.addOption(name, name));
                dropdown.setValue(this.plugin.settings.completionStatusName).onChange((value) => this.plugin.updateSetting('completionStatusName', value));
            });
    }
    
    _renderAddonSettings(containerEl) {
        new Setting(containerEl).setHeading().setName(t('settings.addon.title'));
        
        new Setting(containerEl)
            .setName(t('settings.addon.enable.name'))
            .setDesc(t('settings.addon.enable.desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableFolderRepresentativeNotes)
                .onChange(async (value) => {
                    await this.plugin.updateSetting('enableFolderRepresentativeNotes', value, true);
                    this.display();
                }));
        
        if (this.plugin.settings.enableFolderRepresentativeNotes) {
            new Setting(containerEl)
                .setName(t('settings.addon.filename.name'))
                .setDesc(t('settings.addon.filename.desc'))
                .addText(text => text
                    .setPlaceholder('{{folder_name}}.md')
                    .setValue(this.plugin.settings.folderRepresentativeNoteFilename)
                    .onChange((value) => this.plugin.updateSetting('folderRepresentativeNoteFilename', value, true)));
        }
    }

    _renderHelpTab(containerEl) {
        new Setting(containerEl).setHeading().setName(t('settings.help.title'));

        const helpSections = [
            { titleKey: 'settings.help.quickStart.title', contentKey: 'settings.help.quickStart.content', icon: 'rocket' },
            { titleKey: 'settings.help.coreConcepts.title', contentKey: 'settings.help.coreConcepts.content', icon: 'lightbulb' },
            { titleKey: 'settings.help.keyFeatures.title', contentKey: 'settings.help.keyFeatures.content', icon: 'star' },
            { titleKey: 'settings.help.tips.title', contentKey: 'settings.help.tips.content', icon: 'wand' },
        ];

        helpSections.forEach((section) => {
            const contentData = t(section.contentKey);
            if (!contentData || (Array.isArray(contentData) && contentData.length === 0)) return;

            const detailsEl = containerEl.createEl('details', { cls: 'wmp-help-section', attr: { open: true } });
            const summaryEl = detailsEl.createEl('summary');
            setIcon(summaryEl.createSpan({ cls: 'wmp-help-icon' }), section.icon);
            summaryEl.createEl('strong', { text: t(section.titleKey) });
            const contentContainer = detailsEl.createEl('div', { cls: 'wmp-help-content' });

            if (Array.isArray(contentData)) {
                if (contentData.length > 0 && typeof contentData[0] === 'string') {
                    const listEl = contentContainer.createEl('ol');
                    contentData.forEach(itemText => listEl.createEl('li', { text: itemText }));
                } else if (contentData.length > 0 && typeof contentData[0] === 'object') {
                    contentData.forEach(item => {
                        const itemEl = contentContainer.createDiv({ cls: 'wmp-help-item' });
                        itemEl.createEl('strong', { text: item.term });
                        const p = itemEl.createEl('p');
                        MarkdownRenderer.render(this.app, item.def, p, '', this);
                    });
                }
            }
        });
    }
}

/* WritingManagerPlusView */
class WritingManagerPlusView extends ItemView {
    // View Properties
    plugin;
    currentFolderData = null;
    filesData = [];
    filteredFilesData = [];
    renderedItemCount = 0;
    itemsPerLoad = 30;
    leftPane;
    rightPane;
    activeTabName;
    collapseState;
    filterStatus = 'all';
    filterText = '';
    filterBarEl = null;

    // Lifecycle Methods
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
        this.collapseState = new Map();
    }

    getViewType() { return VIEW_TYPE; }
    getDisplayText() { return t('view.displayText'); }
    getIcon() { return 'notebook-tabs'; }

    async onOpen() {
        this.activeTabName = TAB_ID_FILES;
        await this.ensureValidCurrentFolder();
        this.constructLayout();
        await this.refresh();
    }

    // Core Rendering & Layout
    constructLayout() {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('wmp-container');
        this.leftPane = container.createDiv({ cls: 'wmp-left-pane' });
        this.rightPane = container.createDiv({ cls: 'wmp-right-pane' });
    }

    async refresh() {
        if (this.lastRenderedFolderPath !== this.plugin.settings.currentFolderPath) {
            this.filterText = '';
            this.filterStatus = 'all';
        }
        this.lastRenderedFolderPath = this.plugin.settings.currentFolderPath;

        const container = this.containerEl.children[1];
        container.dataset.paneLayout = this.plugin.settings.paneLayout;
        
        await this.loadDataForCurrentFolder();
        this.renderLeftPane();
        this.renderRightPane();
    }

    // Left Pane Rendering
    renderLeftPane() {
        this.leftPane.empty();
        const treeContainer = this.leftPane.createDiv({ cls: 'folder-tree-container' });
        
        const baseFolder = this.app.vault.getAbstractFileByPath(this.plugin.settings.baseFolderPath);
        if (!(baseFolder instanceof TFolder)) {
            treeContainer.setText(t('view.noBaseFolder'));
            return;
        }
        
        this.setupFolderDragAndDrop(treeContainer);
        this.renderSingleFolderNode(treeContainer, baseFolder, 0);
    }

    renderSingleFolderNode(container, folder, level) {
        const folderItem = container.createDiv({
            cls: 'folder-tree-item',
            attr: { 'style': `padding-left: ${level * 20}px;`, 'data-path': folder.path, 'data-parent-path': folder.parent?.path || '' }
        });
        if (!folder.isRoot()) folderItem.draggable = true;

        const handleEl = folderItem.createSpan({ cls: 'drag-handle' });
        setIcon(handleEl, 'grip-vertical');

        const isActive = folder.path === this.plugin.settings.currentFolderPath;
        if (isActive) folderItem.addClass('is-active');

        const iconEl = folderItem.createSpan({ cls: 'folder-item-icon' });
        setIcon(iconEl, 'notebook');
        const folderName = folder.isRoot() ? this.app.vault.getName() : folder.name;
        folderItem.createSpan({ text: folderName, cls: 'folder-item-title' });
        
        this.registerDomEvent(folderItem, 'click', async () => {
            if (this.plugin.settings.currentFolderPath === folder.path) return;
            this.plugin.settings.currentFolderPath = folder.path;
            await this.plugin.saveSettings();
            this.activeTabName = TAB_ID_FILES;
            await this.refresh();
        });
        
        this.getSortedChildFoldersFor(folder).forEach(child => this.renderSingleFolderNode(container, child, level + 1));
    }

    // Right Pane Rendering
    renderRightPane() {
        this.rightPane.empty();
        
        this.renderRightPaneHeader();
        this.renderFolderInfo();

        const tabContainer = this.rightPane.createDiv({ cls: 'wmp-tab-container' });
        const tabHeaderWrapper = tabContainer.createDiv({ cls: 'wmp-tabs-header' });
        const tabBar = tabHeaderWrapper.createDiv({ cls: 'wmp-tabs-bar' });
        this.filterBarEl = this.renderFilterBar(tabHeaderWrapper);
        const tabContent = tabContainer.createDiv({ cls: 'wmp-tab-content' });
        
        const hasChildFolders = this.getCurrentFolder()?.children.some(c => c instanceof TFolder);
        const hasFiles = this.filesData.length > 0;
        
        this.activeTabName = this._determineActiveTab(hasFiles, hasChildFolders);

        if (hasFiles) this.createTabButton(tabBar, TAB_ID_FILES, 'clapperboard', 'view.tabScenes', tabContent);
        if (hasChildFolders) this.createTabButton(tabBar, TAB_ID_FOLDERS, 'folder-tree', 'view.tabSubfolders', tabContent);
        
        if (this.activeTabName) {
            this.renderTabContent(this.activeTabName, tabContent, tabBar);
        } else {
            tabContent.createEl('p', { text: t('view.noContent'), cls: 'empty-folder-message' });
        }
    }

    renderRightPaneHeader() {
        const actionsContainer = this.rightPane.createDiv({ cls: 'view-actions' });
        const compileButton = actionsContainer.createEl('button', { attr: { 'aria-label': t('view.compileButton') } });
        setIcon(compileButton, 'combine');
        this.registerDomEvent(compileButton, 'click', () => this.executeCompilation());
    }

    renderFolderInfo() {
        const folderInfoContainer = this.rightPane.createDiv({ cls: 'folder-info-container' });
        if (this.currentFolderData) {
            const item = this.createItemElement(this.currentFolderData, {
                baseClass: 'folder-info-item',
                createHeaderLeft: (headerLeft, data) => headerLeft.createEl('h2', { text: data.file.basename })
            });
            folderInfoContainer.appendChild(item);
        } else {
            const folder = this.getCurrentFolder();
            if (folder && this.plugin.settings.enableFolderRepresentativeNotes) {
                folderInfoContainer.addClass('is-empty');
                folderInfoContainer.createEl('p', { text: t('view.noFolderNote', { folderName: folder.name }) });
            }
        }
    }

    // Tab & Filter Rendering
    renderTabContent(tabName, contentContainer, tabBar) {
        this.activeTabName = tabName;
        contentContainer.empty();
        this.applyFilters();
    
        Array.from(tabBar.children).forEach((button) => {
            button.classList.toggle('is-active', button.dataset.tabName === tabName);
        });

        if (tabName === TAB_ID_FOLDERS) {
            this.renderChildFolderList(contentContainer);
        } else if (tabName === TAB_ID_FILES) {
            this.renderSceneList(contentContainer);
        }
    }

    renderFilterBar(container) {
        const filterBar = container.createDiv({ cls: 'wmp-filter-bar' });
        const statusDropdown = filterBar.createEl('select');
        statusDropdown.add(new Option(t('view.filter.allStatuses'), 'all'));
        this.plugin.settings.statuses.forEach(status => statusDropdown.add(new Option(status.name, status.name)));
        statusDropdown.value = this.filterStatus;
        
        const refreshCurrentTab = debounce(() => {
            const tabContent = this.rightPane.querySelector('.wmp-tab-content');
            const tabBar = this.rightPane.querySelector('.wmp-tabs-bar');
            if (tabContent && tabBar) this.renderTabContent(this.activeTabName, tabContent, tabBar);
        }, 300, true);

        this.registerDomEvent(statusDropdown, 'change', () => {
            this.filterStatus = statusDropdown.value;
            refreshCurrentTab();
        });
        const textInput = filterBar.createEl('input', { type: 'text', placeholder: t('view.filter.textPlaceholder') });
        textInput.value = this.filterText;
        this.registerDomEvent(textInput, 'input', () => {
            this.filterText = textInput.value;
            refreshCurrentTab();
        });
        return filterBar;
    }

    // Item & List Rendering
    renderSceneList(container) {
        if (this.filteredFilesData.length === 0 && this.filesData.length > 0) {
            container.createEl('p', { text: t('view.filter.noResults'), cls: 'empty-folder-message' });
            return;
        }
        const listContainer = container.createDiv({cls: 'outliner-list-container'});
        this.renderOutlinerList(listContainer);
    }

    renderOutlinerList(container) {
        if (!container) return;
        container.empty();
        this.renderedItemCount = 0;
        const parentEl = container.createEl('div', { cls: 'outliner-container' });
        this.setupSceneDragAndDrop(parentEl);
        this.renderMoreItems(parentEl);
        this.registerDomEvent(container, 'scroll', debounce(() => this.handleScroll(container, parentEl), 100));
    }

    renderMoreItems(containerEl) {
        if (!containerEl) return;
        const startIndex = this.renderedItemCount;
        const endIndex = Math.min(startIndex + this.itemsPerLoad, this.filteredFilesData.length);
        if (startIndex >= endIndex) return;
        const fragment = document.createDocumentFragment();
        for (let i = startIndex; i < endIndex; i++) {
            const data = this.filteredFilesData[i];
            const originalIndex = this.filesData.findIndex(originalData => originalData.file.path === data.file.path);
            fragment.appendChild(this.createOutlinerItem(data, originalIndex));
        }
        containerEl.appendChild(fragment);
        this.renderedItemCount = endIndex;
    }

    async renderChildFolderList(container) {
        const childFolders = this.getFilteredChildFolders();
        const allChildFolders = this.getSortedChildFoldersFor(this.getCurrentFolder());

        if (childFolders.length === 0 && allChildFolders.length > 0) {
            container.createEl('p', { text: t('view.filter.noResults'), cls: 'empty-folder-message' });
            return;
        }
        const listContainer = container.createDiv({ cls: 'outliner-list-container' });
        const list = listContainer.createEl('div', { cls: 'outliner-container' });

        for (const folder of childFolders) {
            const folderNote = getFolderRepresentativeNote(this.plugin, folder.path);
            let folderData = folderNote ? { file: folderNote, ...await this.extractMetadata(folderNote) } : { file: null, properties: {}, status: '' };
            list.appendChild(this.createChildFolderItem(folder, folderData));
        }
    }
    
    // UI Element Creators
    createTabButton(tabBar, tabName, icon, titleKey, contentContainer) {
        const tabButton = tabBar.createEl('div', { cls: 'wmp-tabs-button', attr: { 'data-tab-name': tabName } });
        setIcon(tabButton, icon);
        tabButton.createSpan({ text: t(titleKey) });
        this.registerDomEvent(tabButton, 'click', () => this.renderTabContent(tabName, contentContainer, tabBar));
    }

    createItemElement(data, { baseClass = 'outliner-item', createHeaderLeft, isDraggable = false, dataset = {} }) {
        const item = document.createElement('div');
        item.className = baseClass;
        item.draggable = isDraggable;
        Object.assign(item.dataset, { status: data.status, ...dataset });
        item.style.setProperty('--status-color', this.plugin.settings.statuses.find(s => s.name === data.status)?.color || 'transparent');

        const header = item.createEl('div', { cls: 'outliner-item-header' });
        const headerLeft = header.createEl('div', { cls: 'outliner-item-header-left' });
        createHeaderLeft(headerLeft, data);
        const headerRight = header.createEl('div', { cls: 'outliner-item-header-right' });
        
        const { metadataFields } = this.plugin.settings;
        const taglineField = metadataFields.find(f => f.isTagline);
        const displayableFields = metadataFields.filter(f => !f.isTagline);

        if (taglineField && data.file) {
            this.createEditableField(item, data, taglineField.name, { containerClass: 'tagline-container' });
        }

        const detailsContainer = item.createDiv({ cls: 'field-display-container' });
        if (data.file) {
            if (displayableFields.length > 0) {
                displayableFields.forEach(field => this.createEditableField(detailsContainer, data, field.name));
            } else if (!taglineField) {
                 detailsContainer.createEl('p', { text: t('view.noMetadataFields'), cls: 'field-display-view is-empty' });
            }
        } else {
            detailsContainer.createEl('p', { text: t('view.noRepresentativeNote'), cls: 'field-display-view is-empty' });
        }
        
        this.createCollapseToggle(headerRight, detailsContainer, data);
        this.createStatusElement(headerRight, data, 'outliner-status');
        
        return item;
    }

    createChildFolderItem(folder, data) {
        return this.createItemElement(data, {
            createHeaderLeft: (headerLeft) => {
                const titleLink = headerLeft.createEl('a', { cls: 'outliner-title internal-link', text: folder.name });
                titleLink.onclick = async () => {
                    if (this.plugin.settings.currentFolderPath === folder.path) return;
                    this.plugin.settings.currentFolderPath = folder.path;
                    await this.plugin.saveSettings();
                    this.activeTabName = TAB_ID_FILES;
                    await this.refresh();
                };
            },
        });
    }
    
    createOutlinerItem(data, index) {
        const isDirectChild = data.file.parent.path === this.plugin.settings.currentFolderPath;
        return this.createItemElement(data, {
            isDraggable: isDirectChild,
            dataset: { filePath: data.file.path, index },
            createHeaderLeft: (headerLeft) => {
                if (isDirectChild) {
                    const handleEl = headerLeft.createSpan({ cls: 'drag-handle' });
                    setIcon(handleEl, 'grip-vertical');
                }
                this.createTitleElement(headerLeft, data.file, 'outliner-title');
            },
        });
    }

    createEditableField(parent, data, fieldName, options = {}) {
        const { containerClass = '' } = options;
        const itemContainer = parent.createDiv({ cls: `metadata-field-item ${containerClass}` });

        const isTagline = this.plugin.settings.metadataFields.find(f => f.name === fieldName)?.isTagline;
        if (!isTagline) itemContainer.createEl('div', { text: fieldName, cls: 'metadata-field-key' });

        const valueWrapper = itemContainer.createDiv({ cls: 'metadata-field-value' });
        const displayEl = valueWrapper.createEl('div', { cls: 'field-display-view' });
        const editorEl = valueWrapper.createEl('input', { type: 'text', cls: 'field-display-editor', attr: { 'style': 'display: none;' } });
        
        new LinkSuggest(this.app, editorEl);

        const renderContent = () => {
        displayEl.empty();
        const content = data.properties[fieldName];
        if (content && String(content).trim() !== '') {
            displayEl.removeClasses(['is-empty', 'is-placeholder']);
            MarkdownRenderer.render(this.app, String(content), displayEl, data.file.path, this);
            displayEl.findAll('a.internal-link').forEach(link => {
            const href = link.getAttr('data-href');
            if (href) {
                this._addInternalLinkHandlers(link, href, data.file.path);
            }
        });

    } else {
        displayEl.addClasses(['is-empty', 'is-placeholder']);
        displayEl.createEl('p', { text: t('view.enterFieldValue', { field: fieldName }) });
    }
};
        const switchToEdit = () => {
            editorEl.value = data.properties[fieldName] || '';
            displayEl.style.display = 'none';
            editorEl.style.display = 'block';
            editorEl.focus();
        };
        const switchToDisplay = async () => {
            const newValue = editorEl.value;
            displayEl.style.display = '';
            editorEl.style.display = 'none';
            if (newValue !== (data.properties[fieldName] || '')) {
                data.properties[fieldName] = newValue;
                await this.saveMetadata(data.file, fieldName, newValue);
                renderContent();
            }
        };

        this.registerDomEvent(displayEl, 'click', (e) => !e.target.closest('a, .internal-link') && (e.preventDefault(), switchToEdit()));
        this.registerDomEvent(editorEl, 'blur', switchToDisplay);
        this.registerDomEvent(editorEl, 'keydown', (e) => (e.key === 'Escape' || e.key === 'Enter') && (e.preventDefault(), editorEl.blur()));
        renderContent();
    }

    createTitleElement(parent, file, cls = '') {
        const link = parent.createEl('a', { text: file.basename, href: file.path, cls: `internal-link ${cls}`, attr: { 'data-href': file.path } });
        this._addInternalLinkHandlers(link, file.path, file.path);
    }

    createCollapseToggle(parentEl, container, data) {
        if (container.childElementCount === 0) return;

        const filePath = data.file?.path;
        let isInitiallyCollapsed = filePath && this.collapseState.has(filePath) ? this.collapseState.get(filePath) : this.plugin.settings.metadataDisplayDefaultCollapsed;
        if (isInitiallyCollapsed) container.addClass('is-collapsed');
        
        const toggleButton = parentEl.createEl('button', { cls: 'collapse-toggle-button', attr: { 'aria-label': isInitiallyCollapsed ? t('misc.toggle.expand') : t('misc.toggle.collapse') } });
        setIcon(toggleButton, isInitiallyCollapsed ? 'chevron-down' : 'chevron-up');
        this.registerDomEvent(toggleButton, 'click', () => {
            const isNowCollapsed = container.classList.toggle('is-collapsed');
            setIcon(toggleButton, isNowCollapsed ? 'chevron-down' : 'chevron-up');
            toggleButton.setAttribute('aria-label', isNowCollapsed ? t('misc.toggle.expand') : t('misc.toggle.collapse'));
            if (filePath) this.collapseState.set(filePath, isNowCollapsed);
        });
    }

    createStatusElement(parent, data, cls = '') {
        const dropdown = parent.createEl('select', { cls });
        this.plugin.settings.statuses.forEach(opt => dropdown.add(new Option(opt.name, opt.name)));
        dropdown.value = data.status;
        if (!data.file) { dropdown.disabled = true; return; }
        this.registerDomEvent(dropdown, 'change', async () => {
            data.status = dropdown.value;
            await this.saveMetadata(data.file, 'status', data.status);
            const hostElement = parent.closest('[data-status]');
            if (hostElement) {
                hostElement.dataset.status = data.status;
                hostElement.style.setProperty('--status-color', this.plugin.settings.statuses.find(s => s.name === data.status)?.color || 'transparent');
            }
        });
    }

    // Event Handlers & Drag-and-Drop
    handleScroll(contentEl, containerEl) {
        if (!contentEl || !containerEl) return;
        if (contentEl.scrollTop + contentEl.clientHeight >= contentEl.scrollHeight - 200 && this.renderedItemCount < this.filteredFilesData.length) {
            this.renderMoreItems(containerEl);
        }
    }

    setupFolderDragAndDrop(container) {
        let draggedEl = null;
        this.registerDomEvent(container, "dragstart", (e) => {
            const target = e.target.closest(".folder-tree-item");
            if (!target || !target.draggable) return;
            draggedEl = target;
            e.dataTransfer.setData("text/plain", target.dataset.path);
            e.dataTransfer.effectAllowed = "move";
            setTimeout(() => target.addClass("is-dragging"), 0);
        });
        this.registerDomEvent(container, "dragend", () => {
            draggedEl?.removeClass("is-dragging");
            draggedEl = null;
            container.findAll(".drop-indicator").forEach(el => el.remove());
        });
        this.registerDomEvent(container, "dragenter", (e) => e.preventDefault());
        this.registerDomEvent(container, "dragover", (e) => {
            e.preventDefault();
            const dropTarget = e.target.closest(".folder-tree-item");
            if (!dropTarget || !draggedEl || dropTarget === draggedEl || !dropTarget.draggable || dropTarget.dataset.parentPath !== draggedEl.dataset.parentPath) return;

            container.findAll(".drop-indicator").forEach(el => el.remove());
            const rect = dropTarget.getBoundingClientRect();
            const isAfter = e.clientY > rect.top + rect.height / 2;
            dropTarget.insertAdjacentElement(isAfter ? 'afterend' : 'beforebegin', createDiv({ cls: 'drop-indicator' }));
        });
        this.registerDomEvent(container, "drop", async (e) => {
            e.preventDefault();
            const indicator = container.find(".drop-indicator");
            if (!indicator || !draggedEl) return;
            const parentPath = draggedEl.dataset.parentPath;
            if (!parentPath) return;

            const newOrder = [];
            const children = Array.from(container.children).filter(el => el.dataset.parentPath === parentPath);
            for (const child of children) {
                if(child === indicator.nextElementSibling && child !== draggedEl) newOrder.push(draggedEl.dataset.path);
                if(child !== draggedEl) newOrder.push(child.dataset.path);
            }
            if(indicator.parentElement === container && !container.nextElementSibling) newOrder.push(draggedEl.dataset.path);
            if(indicator.nextElementSibling === null) newOrder.push(draggedEl.dataset.path);

            indicator.remove();
            this.plugin.settings.folderOrder[parentPath] = [...new Set(newOrder)];
            await this.plugin.saveSettings();
            this.refresh();
        });
    }

    setupSceneDragAndDrop(container) {
        const onDragEnd = (e) => { const target = e.target.closest('[data-index]'); if (target) target.removeClass("is-dragging"); };
        this.registerDomEvent(container, 'dragstart', (e) => { 
            const target = e.target.closest('[data-index]'); 
            if (target) { 
                e.dataTransfer.setData('text/plain', target.dataset.index); 
                target.addClass("is-dragging");
            } 
        });
        this.registerDomEvent(container, 'dragend', onDragEnd);
        this.registerDomEvent(container, 'dragover', (e) => e.preventDefault());
        this.registerDomEvent(container, 'drop', (e) => {
            e.preventDefault(); 
            onDragEnd(e);
            const draggedIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
            const dropTarget = e.target.closest('[data-index]');
            if (!dropTarget || isNaN(draggedIdx)) return;
            const dropIdx = parseInt(dropTarget.dataset.index, 10);
            if (draggedIdx !== dropIdx) this.reorderSceneFiles(draggedIdx, dropIdx);
        });
    }
    
    _addInternalLinkHandlers(element, path, sourcePath) {
        this.registerDomEvent(element, 'mouseover', (e) => this.app.workspace.trigger('hover-link', { event: e, source: VIEW_TYPE, hoverParent: this, targetEl: element, linktext: path, sourcePath: sourcePath }));
        this.registerDomEvent(element, 'click', (e) => {
            e.preventDefault();
            this.app.workspace.openLinkText(path, sourcePath, Keymap.isModEvent(e));
        });
    }

    // Compilation Logic
    async executeCompilation() {
        const { compileOutputPath } = this.plugin.settings;
        if (compileOutputPath === ASK_EVERY_TIME) {
            new FolderSuggestModal(this.app, (selectedPath) => this._performCompilation(selectedPath)).open();
        } else {
            await this._performCompilation(compileOutputPath);
        }
    }

    async _performCompilation(outputPath) {
        const currentFolder = this.getCurrentFolder();
        if (!currentFolder) { new Notice(t('notices.folderNotFound')); return; }
        if (!(this.app.vault.getAbstractFileByPath(outputPath) instanceof TFolder)) { new Notice(t('notices.invalidOutputPath')); return; }
        
        const sortedFilesToCompile = await this.getSortedCompletableFiles();
        const compiledFileCount = sortedFilesToCompile.flatMap(g => g.files).length;
        if (compiledFileCount === 0) {
            new Notice(t('notices.noCompletableFiles', {status: this.plugin.settings.completionStatusName}));
            return;
        }
        
        const compiledContent = await this.generateCompiledContent(currentFolder, sortedFilesToCompile);
        const folderName = currentFolder.isRoot() ? this.app.vault.getName() : currentFolder.name;
        const timestamp = moment().format('YYYY-MM-DD HHmmss');
        const filename = `${folderName} (${timestamp}).md`;
        const finalPath = outputPath === '/' ? filename : `${outputPath}/${filename}`;
        
        try {
            const newFile = await this.app.vault.create(finalPath, compiledContent.trimEnd());
            new Notice(t('notices.compileSuccess', {count: compiledFileCount, path: newFile.path}));
        } catch (e) {
            new Notice(t('notices.compileFailure'));
            console.error(e);
        }
    }
    
    async getSortedCompletableFiles() {
        const { completionStatusName, fileOrder } = this.plugin.settings;
        if (!completionStatusName) {
            new Notice(t('notices.noCompletionStatus'));
            return [];
        }

        const rootFolder = this.getCurrentFolder();
        if (!rootFolder) return [];

        const getAllFoldersSorted = (folder) => {
            let result = [folder];
            this.getSortedChildFoldersFor(folder).forEach(child => result.push(...getAllFoldersSorted(child)));
            return result;
        };
        const allSortedFolders = this.plugin.settings.includeSubfolderFiles ? getAllFoldersSorted(rootFolder) : [rootFolder];
        
        const allNotesInScope = this.plugin.settings.includeSubfolderFiles ? await collectFilesRecursively(rootFolder) : rootFolder.children.filter(f => f instanceof TFile && f.extension === MARKDOWN_EXTENSION);
        const allNotePaths = new Set(allNotesInScope.map(f => f.path));

        const folderNotePaths = new Set();
        if (this.plugin.settings.enableFolderRepresentativeNotes) {
            for(const folder of allSortedFolders) {
                const note = getFolderRepresentativeNote(this.plugin, folder.path);
                if(note) folderNotePaths.add(note.path);
            }
        }

        const finalGroupedResult = [];
        for (const folder of allSortedFolders) {
            const filesInFolder = folder.children.filter(f => f instanceof TFile && allNotePaths.has(f.path) && !folderNotePaths.has(f.path));
            const filesData = await Promise.all(filesInFolder.map(async (file) => ({ file, ...await this.extractMetadata(file) })));
            const completableFilesData = filesData.filter(d => d.status === completionStatusName);

            if (completableFilesData.length > 0) {
                const orderForFolder = fileOrder[folder.path] || [];
                const orderMap = new Map(orderForFolder.map((path, index) => [path, index]));
                completableFilesData.sort((a, b) => (orderMap.get(a.file.path) ?? Infinity) - (orderMap.get(b.file.path) ?? Infinity) || a.file.path.localeCompare(b.file.path));
                finalGroupedResult.push({ folder: folder, files: completableFilesData });
            }
        }
        return finalGroupedResult;
    }
    
    _getHeadingLevelForPath(path, rootPath, baseLevel) {
        const relativePath = path.substring(rootPath.length);
        const depth = (relativePath.match(/\//g) || []).length;
        return depth + baseLevel;
    }

    async generateCompiledContent(rootFolder, sortedFolderGroups) {
        let compiledContent = `# ${rootFolder.isRoot() ? this.app.vault.getName() : rootFolder.name}\n\n`;
        const rootPath = rootFolder.path === '/' ? '' : rootFolder.path;
    
        for (const group of sortedFolderGroups) {
            if (group.folder.path !== rootFolder.path) {
                const folderHeadingLevel = this._getHeadingLevelForPath(group.folder.path, rootPath, 1);
                compiledContent += `${'#'.repeat(folderHeadingLevel)} ${group.folder.name}\n\n`;
            }
            for (const data of group.files) {
                const content = await this.app.vault.read(data.file);
                const cleanContent = content.replace(/^---[\s\S]*?---\n*/, '');
                const titleHeadingLevel = this._getHeadingLevelForPath(group.folder.path, rootPath, 2);
                compiledContent += `${'#'.repeat(titleHeadingLevel)} ${data.file.basename}\n\n${cleanContent}\n\n***\n\n`;
            }
        }
        return compiledContent;
    }

    // Data Handling & Helpers
    async loadDataForCurrentFolder() {
        this.currentFolderData = null;
        this.filesData = [];
        const folder = this.getCurrentFolder();
        if (!folder) return;
    
        const allFoldersInScope = this.plugin.settings.includeSubfolderFiles ? [folder, ...await collectFoldersRecursively(folder)] : [folder];
    
        const folderNotePaths = new Set();
        if (this.plugin.settings.enableFolderRepresentativeNotes) {
            const folderNotes = (await Promise.all(allFoldersInScope.map(f => getFolderRepresentativeNote(this.plugin, f.path)))).filter(Boolean);
            folderNotes.forEach(note => folderNotePaths.add(note.path));
        }
    
        const topLevelFolderNote = getFolderRepresentativeNote(this.plugin, folder.path);
        if (topLevelFolderNote) this.currentFolderData = { file: topLevelFolderNote, ...await this.extractMetadata(topLevelFolderNote) };
    
        if (this.plugin.settings.includeSubfolderFiles) {
            const getAllFoldersSorted = (current) => {
                let result = [current];
                this.getSortedChildFoldersFor(current).forEach(child => result.push(...getAllFoldersSorted(child)));
                return result;
            };
            let sortedFiles = [];
            for (const f of getAllFoldersSorted(folder)) {
                const filesInFolder = f.children.filter(c => c instanceof TFile && c.extension === MARKDOWN_EXTENSION && !folderNotePaths.has(c.path));
                const orderForFolder = this.plugin.settings.fileOrder[f.path] || [];
                const orderMap = new Map(orderForFolder.map((path, index) => [path, index]));
                filesInFolder.sort((a, b) => (orderMap.get(a.path) ?? Infinity) - (orderMap.get(b.path) ?? Infinity) || a.path.localeCompare(b.path));
                sortedFiles.push(...filesInFolder);
            }
            this.filesData = await Promise.all(sortedFiles.map(async file => ({ file, ...await this.extractMetadata(file) })));
        } else {
            const sceneFiles = folder.children.filter(f => f instanceof TFile && f.extension === MARKDOWN_EXTENSION && !folderNotePaths.has(f.path));
            this.filesData = await Promise.all(sceneFiles.map(async file => ({ file, ...await this.extractMetadata(file) })));
            this.sortSceneFilesByOrder();
        }
        this.applyFilters();
    }

    applyFilters() {
        const lowerCaseFilter = this.filterText.toLowerCase();
        this.filteredFilesData = this.filesData.filter(item => {
            const statusMatch = this.filterStatus === 'all' || item.status === this.filterStatus;
            const textMatch = !lowerCaseFilter || item.file.basename.toLowerCase().includes(lowerCaseFilter);
            return statusMatch && textMatch;
        });
    }

    getFilteredChildFolders() {
        const currentFolder = this.getCurrentFolder();
        if (!currentFolder) return [];

        const lowerCaseFilter = this.filterText.toLowerCase();
        let childFolders = this.getSortedChildFoldersFor(currentFolder);

        if (lowerCaseFilter) childFolders = childFolders.filter(folder => folder.name.toLowerCase().includes(lowerCaseFilter));
        if (this.filterStatus !== 'all') {
            childFolders = childFolders.filter(folder => {
                const noteFile = getFolderRepresentativeNote(this.plugin, folder.path);
                if (!noteFile) return false;
                return this.app.metadataCache.getFileCache(noteFile)?.frontmatter?.status === this.filterStatus;
            });
        }
        return childFolders;
    }

    getSortedChildFoldersFor(parentFolder) {
        if (!parentFolder) return [];
        const order = this.plugin.settings.folderOrder[parentFolder.path] || [];
        const orderMap = new Map(order.map((path, index) => [path, index]));
        const childFolders = parentFolder.children.filter(child => child instanceof TFolder);
        childFolders.sort((a, b) => (orderMap.get(a.path) ?? Infinity) - (orderMap.get(b.path) ?? Infinity) || a.name.localeCompare(b.name));
        return childFolders;
    }

    sortSceneFilesByOrder() {
        const order = this.plugin.settings.fileOrder[this.plugin.settings.currentFolderPath] || [];
        const orderMap = new Map(order.map((path, index) => [path, index]));
        this.filesData.sort((a, b) => (orderMap.get(a.file.path) ?? Infinity) - (orderMap.get(b.file.path) ?? Infinity) || a.file.name.localeCompare(b.file.name));
    }

    reorderSceneFiles(fromIndex, toIndex) {
        const item = this.filesData.splice(fromIndex, 1)[0];
        this.filesData.splice(toIndex, 0, item);
        this.plugin.settings.fileOrder[this.plugin.settings.currentFolderPath] = this.filesData.map(d => d.file.path);
        this.plugin.saveSettings();
        this.refresh();
    }

    async extractMetadata(file) {
        const cache = this.app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter || {};
        const defaultStatus = this.plugin.settings.statuses[0]?.name || '';
        return { status: frontmatter.status || defaultStatus, properties: frontmatter };
    }

    async saveMetadata(file, key, value) {
        try {
            await this.app.fileManager.processFrontMatter(file, (fm) => {
                if (value) fm[key] = value; else delete fm[key];
            });
        } catch (e) {
            new Notice(t('notices.metadataSaveFailed', {name: file.name}));
            console.error(e);
        }
    }

    _determineActiveTab(canShowFiles, canShowFolders) {
        const isCurrentTabValid = (this.activeTabName === TAB_ID_FILES && canShowFiles) || (this.activeTabName === TAB_ID_FOLDERS && canShowFolders);
        if (isCurrentTabValid) return this.activeTabName;
        if (canShowFiles) return TAB_ID_FILES;
        if (canShowFolders) return TAB_ID_FOLDERS;
        return null;
    }
    
    getCurrentFolder() { return this.app.vault.getAbstractFileByPath(this.plugin.settings.currentFolderPath); }

    isFileRelevant(file) {
        const currentPath = this.plugin.settings.currentFolderPath;
        if (!currentPath || !file || !(file instanceof TFile)) return false;

        const currentFolder = this.getCurrentFolder();
        if (!currentFolder) return false;

        if (this.plugin.settings.enableFolderRepresentativeNotes) {
            const folderNote = getFolderRepresentativeNote(this.plugin, currentPath);
            if (file.path === folderNote?.path) return true;
        }
        return file.path.startsWith(currentPath + '/');
    }

    async ensureValidCurrentFolder() {
        const { baseFolderPath, currentFolderPath } = this.plugin.settings;
        if (!(this.app.vault.getAbstractFileByPath(baseFolderPath) instanceof TFolder)) return;
        if (!(this.app.vault.getAbstractFileByPath(currentFolderPath) instanceof TFolder) || !currentFolderPath.startsWith(baseFolderPath)) {
            this.plugin.settings.currentFolderPath = baseFolderPath;
            await this.plugin.saveSettings();
        }
    }
}


/* =============
PLUGIN CORE
============= */

/* WritingManagerPlusPlugin */
class WritingManagerPlusPlugin extends Plugin {
    settings;

    // Lifecycle Methods
    async onload() {
        await this.loadSettings();
        await loadTranslations(this);
        this.initializeDefaultStatuses();

        this.addSettingTab(new WritingManagerPlusSettingTab(this.app, this));
        this.registerView(VIEW_TYPE, (leaf) => new WritingManagerPlusView(leaf, this));
        
        this.addRibbonIcon('notebook-tabs', t('ribbon.title'), () => this.activateView());
        this.addPluginCommands();
        this.registerPluginEvents();
    }

    onunload() {
        this.app.workspace.detachLeavesOfType(VIEW_TYPE);
    }

    // Plugin Setup
    initializeDefaultStatuses() {
        if (!this.settings.statuses || this.settings.statuses.length === 0) {
            this.settings.statuses = [
                { key: 'idea', name: t('statuses.idea'), color: 'var(--color-purple)' },
                { key: 'writing', name: t('statuses.writing'), color: 'var(--color-blue)' },
                { key: 'done', name: t('statuses.done'), color: 'var(--color-green)' },
                { key: 'on-hold', name: t('statuses.on-hold'), color: 'var(--text-muted)' }
            ];
            this.settings.completionStatusName = t('statuses.done');
            this.saveSettings();
        }
    }

    addPluginCommands() {
        this.addCommand({
            id: 'compile-files',
            name: t('commands.compile.name'),
            callback: () => this.getView()?.executeCompilation()
        });
    }

    registerPluginEvents() {
        const debouncedRefresh = debounce(() => this.refreshView(), 250, true);
        this.registerEvent(this.app.metadataCache.on('changed', (file) => {
            const view = this.getView();
            if (view && view.isFileRelevant(file)) debouncedRefresh();
        }));
        this.registerEvent(this.app.vault.on('rename', (file, oldPath) => this.handleRename(file, oldPath)));
        this.registerEvent(this.app.vault.on('delete', (file) => this.handleDelete(file)));
        this.app.workspace.onLayoutReady(() => this.refreshView());
    }

    // Event Handlers & File Operations
    async handleRename(file, oldPath) {
        const { fileOrder, folderOrder } = this.settings;
        let settingsChanged = false;

        if (file instanceof TFolder) {
            const newPath = file.path;
            const oldParentPath = oldPath.substring(0, oldPath.lastIndexOf('/')) || '/';
            const newParentPath = file.parent.path;
            if (fileOrder[oldPath]) {
                fileOrder[newPath] = fileOrder[oldPath].map(filePath => filePath.replace(oldPath, newPath));
                delete fileOrder[oldPath];
                settingsChanged = true;
            }
            if (folderOrder[oldPath]) {
                folderOrder[newPath] = folderOrder[oldPath].map(childPath => childPath.replace(oldPath, newPath));
                delete folderOrder[oldPath];
                settingsChanged = true;
            }
            if (oldParentPath !== newParentPath) { 
                if (folderOrder[oldParentPath]) {
                    const index = folderOrder[oldParentPath].indexOf(oldPath);
                    if (index > -1) {
                        folderOrder[oldParentPath].splice(index, 1);
                        if (folderOrder[oldParentPath].length === 0) delete folderOrder[oldParentPath];
                        settingsChanged = true;
                    }
                }
                if (!folderOrder[newParentPath]) folderOrder[newParentPath] = [];
                if (!folderOrder[newParentPath].includes(newPath)) {
                    folderOrder[newParentPath].push(newPath);
                    settingsChanged = true;
                }
            } else {
                 if (folderOrder[newParentPath]) {
                    const index = folderOrder[newParentPath].indexOf(oldPath);
                    if (index > -1) {
                        folderOrder[newParentPath][index] = newPath;
                        settingsChanged = true;
                    }
                }
            }
            for (const parent in folderOrder) {
                folderOrder[parent] = folderOrder[parent].map(p => p.startsWith(oldPath + '/') ? p.replace(oldPath, newPath) : p);
            }
            if (this.settings.currentFolderPath === oldPath) {
                this.settings.currentFolderPath = newPath;
                settingsChanged = true;
            }
            if (this.settings.currentFolderPath.startsWith(oldPath + '/')) {
                this.settings.currentFolderPath = this.settings.currentFolderPath.replace(oldPath, newPath);
                settingsChanged = true;
            }
        } else if (file instanceof TFile) {
            for (const folderPath in fileOrder) {
                const orderArray = fileOrder[folderPath];
                const fileIndex = orderArray.indexOf(oldPath);
                if (fileIndex > -1) {
                    orderArray[fileIndex] = file.path;
                    settingsChanged = true;
                    break;
                }
            }
        }
        if (settingsChanged) await this.saveSettings();
        this.refreshView();
    }

    async handleDelete(file) {
        const { fileOrder, folderOrder } = this.settings;
        const path = file.path;
        let settingsChanged = false;

        const recursiveDeleteFromOrder = (orderObject, deletedPath) => {
            let changed = false;
            for (const parentPath in orderObject) {
                const index = orderObject[parentPath].indexOf(deletedPath);
                if (index > -1) {
                    orderObject[parentPath].splice(index, 1);
                    if (orderObject[parentPath].length === 0) delete orderObject[parentPath];
                    changed = true;
                }
            }
            if(orderObject[deletedPath]) {
                delete orderObject[deletedPath];
                changed = true;
            }
            return changed;
        }

        if (file instanceof TFolder) {
            if (recursiveDeleteFromOrder(folderOrder, path)) settingsChanged = true;
            if (fileOrder[path]) {
                delete fileOrder[path];
                settingsChanged = true;
            }
        } else if (file instanceof TFile) {
            if (recursiveDeleteFromOrder(fileOrder, path)) settingsChanged = true;
        }
        if (settingsChanged) await this.saveSettings();
        this.refreshView();
    }
    
    // View & Settings Management
    getView() {
        const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
        return leaf?.view instanceof WritingManagerPlusView ? leaf.view : null;
    }

    async activateView() {
        this.app.workspace.detachLeavesOfType(VIEW_TYPE);
        const leaf = this.app.workspace.getRightLeaf(false);
        await leaf.setViewState({ type: VIEW_TYPE, active: true });
        this.app.workspace.revealLeaf(leaf);
    }

    refreshView() {
        this.getView()?.refresh();
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
        this.migrateSettings();
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
    
    async updateSetting(key, value, refreshView = false) {
        this.settings[key] = value;
        await this.saveSettings();
        if (refreshView) this.refreshView();
    }

    // Settings Migration
    migrateSettings() {
        let settingsUpdated = false;
        if (this.settings.metadataFields && this.settings.metadataFields.some(f => f.hasOwnProperty('role'))) {
            this.settings.metadataFields = this.settings.metadataFields.map(field => ({
                name: field.name,
                isTagline: field.role === 'subtitle'
            }));
            settingsUpdated = true;
        }
        if (this.settings.displayableFields) {
            const newFields = this.settings.displayableFields.map(fieldName => ({ name: fieldName, isTagline: fieldName === this.settings.subtitleField }));
            if (this.settings.subtitleField && this.settings.subtitleField !== 'none' && !newFields.some(f => f.name === this.settings.subtitleField)) {
                newFields.push({ name: this.settings.subtitleField, isTagline: true });
            }
            this.settings.metadataFields = newFields;
            delete this.settings.displayableFields;
            delete this.settings.subtitleField;
            delete this.settings.coreInfoField;
            settingsUpdated = true;
        }
        const oldToNewMap = {
            'enableFolderSummaryNotes': 'enableFolderRepresentativeNotes',
            'folderSummaryNoteFilename': 'folderRepresentativeNoteFilename',
            'enableFolderNotes': 'enableFolderRepresentativeNotes',
            'folderNoteFilename': 'folderRepresentativeNoteFilename'
        };
        for (const oldKey in oldToNewMap) {
            if (typeof this.settings[oldKey] !== 'undefined') {
                this.settings[oldToNewMap[oldKey]] = this.settings[oldKey];
                delete this.settings[oldKey];
                settingsUpdated = true;
            }
        }
        if (settingsUpdated) this.saveSettings();
    }
}

module.exports = WritingManagerPlusPlugin;