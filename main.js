const { Plugin, MarkdownRenderer, Notice, PluginSettingTab, Setting } = require('obsidian');

const MAX_BLOCKS_PER_ROW = 3;
const DEFAULT_CARD_WIDTH = 240;
const DEFAULT_CARD_HEIGHT = 190;
const MIN_CARD_WIDTH = 140;
const MIN_CARD_HEIGHT = 120;
const ROW_GROUP_TOLERANCE = 90;

const DEFAULT_SETTINGS = {
  defaultGap: '14px',
  defaultTitleSize: '1.05em',
  defaultBodySize: '1em',
  defaultRadius: '12px',
};

const GLOBAL_ALIASES = {
  gap: 'gap',
  titlesize: 'titleSize',
  bodysize: 'bodySize',
  radius: 'radius',
  align: 'align',
};

const BLOCK_ALIASES = {
  title: 'title',
  subtitle: 'subtitle',
  icon: 'icon',
  x: 'x',
  y: 'y',
  width: 'width',
  height: 'height',
  background: 'cardBackground',
  bg: 'cardBackground',
  cardbackground: 'cardBackground',
  color: 'textColor',
  textcolor: 'textColor',
  titlecolor: 'titleColor',
  titlebackground: 'titleBackground',
  titlebg: 'titleBackground',
  accent: 'accentColor',
  accentcolor: 'accentColor',
  titlesize: 'titleSize',
  bodysize: 'bodySize',
  radius: 'radius',
};

const PALETTE = [
  { bg: '#fff7ed', titleBg: '#fed7aa', titleColor: '#9a3412', color: '#1c1917', accent: '#f97316' },
  { bg: '#ecfdf5', titleBg: '#bbf7d0', titleColor: '#065f46', color: '#052e16', accent: '#10b981' },
  { bg: '#eff6ff', titleBg: '#bfdbfe', titleColor: '#1d4ed8', color: '#0f172a', accent: '#3b82f6' },
  { bg: '#f5f3ff', titleBg: '#ddd6fe', titleColor: '#6d28d9', color: '#1e1b4b', accent: '#8b5cf6' },
  { bg: '#fdf2f8', titleBg: '#fbcfe8', titleColor: '#be185d', color: '#3f0f29', accent: '#ec4899' },
  { bg: '#fefce8', titleBg: '#fde68a', titleColor: '#854d0e', color: '#292524', accent: '#eab308' },
  { bg: '#ecfeff', titleBg: '#a5f3fc', titleColor: '#0e7490', color: '#083344', accent: '#06b6d4' },
  { bg: '#f0fdf4', titleBg: '#86efac', titleColor: '#166534', color: '#052e16', accent: '#22c55e' },
  { bg: '#fef2f2', titleBg: '#fecaca', titleColor: '#991b1b', color: '#450a0a', accent: '#ef4444' },
];

module.exports = class DragAndDropColumnsPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new DragAndDropColumnsSettingTab(this.app, this));

    this.registerMarkdownCodeBlockProcessor('drag-layout', async (source, el, ctx) => this.renderLayout(source, el, ctx));
    this.registerMarkdownCodeBlockProcessor('drag-cols', async (source, el, ctx) => this.renderLayout(source, el, ctx));

    this.addCommand({
      id: 'insert-empty-drag-layout-block',
      name: 'Insert editable drag layout block',
      editorCallback: (editor) => editor.replaceSelection(createInitialLayoutSource()),
    });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async renderLayout(source, el, ctx) {
    const parsed = parseLayoutSource(source);
    const options = this.mergeGlobalOptions(parsed.options);
    const rows = parsed.rows;

    el.empty();
    const root = el.createDiv({ cls: 'ddc-root ddc-explicit-rows' });
    root.style.setProperty('--ddc-gap', normalizeCssSize(options.gap, this.settings.defaultGap));
    root.style.setProperty('--ddc-align', options.align || 'flex-start');

    const board = root.createDiv({ cls: 'ddc-board' });
    this.renderNewRowZone(board, ctx, el, 0, rows.length === 0 ? '+ create first row' : 'drop here to create a row');

    let flatIndex = 0;
    rows.forEach((row, rowIndex) => {
      const rowWrap = board.createDiv({ cls: 'ddc-row-wrap' });
      const rowEl = rowWrap.createDiv({ cls: 'ddc-row', attr: { 'data-row': String(rowIndex) } });
      rowEl.toggleClass('is-full', row.blocks.length >= MAX_BLOCKS_PER_ROW);

      if (!row.blocks.length) {
        rowEl.createDiv({ cls: 'ddc-empty', text: 'Empty row' });
      }

      row.blocks.forEach((rawBlock, blockIndex) => {
        const block = this.parseBlock(rawBlock.content);
        const cardOptions = this.mergeBlockOptions(options, block.options, flatIndex);
        const card = rowEl.createDiv({ cls: 'ddc-card' });
        card.dataset.row = String(rowIndex);
        card.dataset.index = String(blockIndex);
        this.applyCardStyles(card, cardOptions, blockIndex);

        const handle = card.createDiv({ cls: 'ddc-handle', attr: { title: 'Drag to move. Drop between rows to create a new row.' } });
        handle.createSpan({ cls: 'ddc-grip', text: '☰' });
        handle.createSpan({ cls: 'ddc-label', text: `Row ${rowIndex + 1} · Block ${blockIndex + 1}` });
        this.bindDragHandle(handle, card, root, ctx, el, rowIndex, blockIndex);

        const deleteButton = card.createEl('button', {
          cls: 'ddc-delete',
          text: '×',
          attr: { title: 'Click twice to delete this block.' },
        });
        this.bindDeleteButton(deleteButton, ctx, el, rowIndex, blockIndex);

        const resizeHandle = card.createDiv({ cls: 'ddc-resize', attr: { title: 'Drag to resize.' } });
        this.bindResizeHandle(resizeHandle, card, rowEl, ctx, el, rowIndex, blockIndex);

        const header = card.createDiv({ cls: 'ddc-titlebar' });
        const titleLine = header.createDiv({ cls: 'ddc-titleline' });
        const iconInput = titleLine.createEl('input', { cls: 'ddc-edit ddc-icon-input', attr: { placeholder: 'Icon' } });
        iconInput.value = block.icon || '';
        const titleInput = titleLine.createEl('input', { cls: 'ddc-edit ddc-title-input', attr: { placeholder: 'Title' } });
        titleInput.value = block.title || '';
        const subtitleInput = header.createEl('input', { cls: 'ddc-edit ddc-subtitle-input', attr: { placeholder: 'Subtitle' } });
        subtitleInput.value = block.subtitle || '';

        const bodyWrap = card.createDiv({ cls: 'ddc-body-wrap' });
        const preview = bodyWrap.createDiv({ cls: 'ddc-content-preview' });
        const editor = bodyWrap.createEl('textarea', {
          cls: 'ddc-edit ddc-content-input',
          attr: { placeholder: 'Body: Markdown / math / Chinese' },
        });
        editor.value = block.body || '';
        editor.hide();
        this.renderBodyPreview(block.body, preview, ctx);

        this.stopInteractiveEvents([iconInput, titleInput, subtitleInput, editor, preview, deleteButton, resizeHandle]);
        this.bindEditableBlock(card, ctx, el, rowIndex, blockIndex, {
          iconInput,
          titleInput,
          subtitleInput,
          contentInput: editor,
          preview,
        });

        preview.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          preview.hide();
          editor.show();
          window.setTimeout(() => {
            editor.focus();
            try {
              editor.selectionStart = editor.value.length;
              editor.selectionEnd = editor.value.length;
            } catch (error) {
              // Ignore selection errors from unusual input methods.
            }
          }, 0);
        });

        flatIndex += 1;
      });

      adjustFreeRowHeight(rowEl);

      const addToRowButton = rowWrap.createEl('button', {
        cls: 'ddc-add ddc-add-row-block',
        text: '+',
        attr: { title: row.blocks.length >= MAX_BLOCKS_PER_ROW ? 'Max 3 blocks per row.' : 'Add one block to this row.' },
      });
      if (row.blocks.length >= MAX_BLOCKS_PER_ROW) {
        addToRowButton.disabled = true;
        addToRowButton.addClass('is-disabled');
      } else {
        addToRowButton.addEventListener('click', () => this.appendBlockToRow(ctx, el, rowIndex));
      }

      this.renderNewRowZone(board, ctx, el, rowIndex + 1, 'drop here to create a row');
    });
  }

  renderNewRowZone(board, ctx, el, rowIndex, label) {
    const zone = board.createDiv({
      cls: 'ddc-new-row-zone',
      attr: {
        'data-row-insert': String(rowIndex),
        title: 'Click or drop a block here to create a new row.',
      },
    });
    zone.createSpan({ cls: 'ddc-new-row-plus', text: '+' });
    zone.createSpan({ cls: 'ddc-new-row-label', text: label });
    zone.addEventListener('click', () => this.appendBlockAsNewRow(ctx, el, rowIndex));
  }

  mergeGlobalOptions(parsed) {
    return {
      gap: parsed.gap || this.settings.defaultGap,
      titleSize: parsed.titleSize || this.settings.defaultTitleSize,
      bodySize: parsed.bodySize || this.settings.defaultBodySize,
      radius: parsed.radius || this.settings.defaultRadius,
      align: parsed.align || 'flex-start',
    };
  }

  mergeBlockOptions(globalOptions, blockOptions, index) {
    const auto = getPalette(index);
    return Object.assign({
      cardBackground: auto.bg,
      titleBackground: auto.titleBg,
      titleColor: auto.titleColor,
      textColor: auto.color,
      accentColor: auto.accent,
    }, globalOptions, blockOptions);
  }

  applyCardStyles(card, options, blockIndex = 0) {
    setCssVar(card, '--ddc-card-bg', options.cardBackground);
    setCssVar(card, '--ddc-card-text', options.textColor);
    setCssVar(card, '--ddc-title-color', options.titleColor);
    setCssVar(card, '--ddc-title-bg', options.titleBackground);
    setCssVar(card, '--ddc-accent', options.accentColor);
    setCssVar(card, '--ddc-title-size', normalizeCssSize(options.titleSize, this.settings.defaultTitleSize));
    setCssVar(card, '--ddc-body-size', normalizeCssSize(options.bodySize, this.settings.defaultBodySize));
    setCssVar(card, '--ddc-radius', normalizeCssSize(options.radius, this.settings.defaultRadius));

    const fallbackPosition = getDefaultBlockPosition(blockIndex);
    const x = Math.max(0, parseCssPx(options.x, fallbackPosition.x));
    const y = Math.max(0, parseCssPx(options.y, fallbackPosition.y));
    card.style.position = 'absolute';
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
    card.style.flex = 'none';
    card.style.minWidth = `${MIN_CARD_WIDTH}px`;

    const width = normalizeCssSize(options.width, `${DEFAULT_CARD_WIDTH}px`);
    card.style.width = width;

    const height = normalizeCssSize(options.height, `${DEFAULT_CARD_HEIGHT}px`);
    card.style.height = height;
    card.style.minHeight = `${MIN_CARD_HEIGHT}px`;
  }

  parseBlock(rawBlock) {
    const { options, body } = parseBlockContent(rawBlock);
    let nextBody = body;
    let title = options.title || '';
    let subtitle = options.subtitle || '';
    const icon = options.icon || '';

    if (!title) {
      const titleResult = extractFirstMarkdownHeading(nextBody);
      if (titleResult) {
        title = titleResult.title;
        nextBody = titleResult.body;
      }
    }

    if (!subtitle) {
      const subtitleResult = extractSubtitle(nextBody);
      if (subtitleResult) {
        subtitle = subtitleResult.subtitle;
        nextBody = subtitleResult.body;
      }
    }

    return { options, title, subtitle, icon, body: nextBody };
  }

  async renderMarkdown(markdown, target, ctx) {
    if (MarkdownRenderer && typeof MarkdownRenderer.render === 'function') {
      await MarkdownRenderer.render(this.app, markdown, target, ctx.sourcePath || '', this);
      return;
    }
    if (MarkdownRenderer && typeof MarkdownRenderer.renderMarkdown === 'function') {
      await MarkdownRenderer.renderMarkdown(markdown, target, ctx.sourcePath || '', this);
      return;
    }
    target.setText(markdown);
  }

  async renderBodyPreview(markdown, preview, ctx) {
    preview.empty();
    if (markdown && markdown.trim()) {
      await this.renderMarkdown(markdown, preview, ctx);
    } else {
      preview.createDiv({ cls: 'ddc-muted', text: 'Body: click to edit.' });
    }
  }

  stopInteractiveEvents(nodes) {
    const events = [
      'dragstart', 'pointerdown', 'mousedown', 'click', 'dblclick',
      'keydown', 'keyup', 'keypress', 'beforeinput', 'input',
      'compositionstart', 'compositionupdate', 'compositionend',
      'paste', 'copy', 'cut',
    ];
    nodes.forEach((node) => {
      events.forEach((eventName) => {
        node.addEventListener(eventName, (event) => event.stopPropagation());
      });
    });
  }

  bindDragHandle(handle, card, root, ctx, el, rowIndex, blockIndex) {
    let startX = 0;
    let startY = 0;
    let didDrag = false;
    let previousPointerEvents = '';
    let offsetX = 0;
    let offsetY = 0;
    let dragWidth = DEFAULT_CARD_WIDTH;
    let dragHeight = DEFAULT_CARD_HEIGHT;

    const cleanup = () => {
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      document.body.classList.remove('ddc-moving-active');
      card.classList.remove('is-dragging');
      card.style.pointerEvents = previousPointerEvents;
      clearDropIndicators(root);
      adjustFreeRowHeight(card.closest('.ddc-row'));
    };

    const getTarget = (event) => findDropTarget(root, event.clientX, event.clientY, {
      offsetX,
      offsetY,
      width: dragWidth,
      height: dragHeight,
      rowIndex,
      blockIndex,
    });

    const onMove = (event) => {
      const distance = Math.hypot(event.clientX - startX, event.clientY - startY);
      if (!didDrag && distance < 4) return;
      if (!didDrag) {
        didDrag = true;
        previousPointerEvents = card.style.pointerEvents || '';
        card.style.pointerEvents = 'none';
        card.classList.add('is-dragging');
        document.body.classList.add('ddc-moving-active');
      }

      const target = getTarget(event);
      showDropTarget(root, target, { rowIndex, blockIndex });

      if (target && target.kind === 'row' && target.rowIndex === rowIndex) {
        card.style.left = `${target.x}px`;
        card.style.top = `${target.y}px`;
        adjustFreeRowHeight(card.closest('.ddc-row'));
      }
    };

    const onUp = async (event) => {
      const target = didDrag ? getTarget(event) : null;
      cleanup();
      if (!didDrag || !target) return;
      try {
        if (target.kind === 'row' && target.rowIndex === rowIndex) {
          await this.updateBlockOptions(ctx, el, rowIndex, blockIndex, {
            x: `${target.x}px`,
            y: `${target.y}px`,
          });
          return;
        }
        await this.moveBlock(ctx, el, { rowIndex, blockIndex }, target);
      } catch (error) {
        console.error(error);
        new Notice(error.message || 'Failed to move block.');
      }
    };

    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = card.getBoundingClientRect();
      startX = event.clientX;
      startY = event.clientY;
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;
      dragWidth = rect.width || DEFAULT_CARD_WIDTH;
      dragHeight = rect.height || DEFAULT_CARD_HEIGHT;
      didDrag = false;
      document.addEventListener('pointermove', onMove, true);
      document.addEventListener('pointerup', onUp, true);
    });
  }

  bindResizeHandle(handle, card, rowEl, ctx, el, rowIndex, blockIndex) {
    let startX = 0;
    let startY = 0;
    let startWidth = 0;
    let startHeight = 0;
    let maxWidth = 0;
    let raf = null;

    const onMove = (event) => {
      const width = clamp(Math.round(startWidth + event.clientX - startX), MIN_CARD_WIDTH, maxWidth);
      const height = Math.max(MIN_CARD_HEIGHT, Math.round(startHeight + event.clientY - startY));
      if (raf) window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        card.style.width = `${width}px`;
        card.style.height = `${height}px`;
        card.style.minHeight = `${MIN_CARD_HEIGHT}px`;
        adjustFreeRowHeight(rowEl);
      });
    };

    const onUp = async (event) => {
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      document.body.classList.remove('ddc-resizing-active');
      if (raf) window.cancelAnimationFrame(raf);
      const width = clamp(Math.round(startWidth + event.clientX - startX), MIN_CARD_WIDTH, maxWidth);
      const height = Math.max(MIN_CARD_HEIGHT, Math.round(startHeight + event.clientY - startY));
      card.style.width = `${width}px`;
      card.style.height = `${height}px`;
      card.style.minHeight = `${MIN_CARD_HEIGHT}px`;
      adjustFreeRowHeight(rowEl);
      await this.updateBlockOptions(ctx, el, rowIndex, blockIndex, { width: `${width}px`, height: `${height}px` });
    };

    handle.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = card.getBoundingClientRect();
      startX = event.clientX;
      startY = event.clientY;
      startWidth = rect.width;
      startHeight = rect.height;
      maxWidth = getMaxWidthForResize(card, rowEl);
      document.body.classList.add('ddc-resizing-active');
      document.addEventListener('pointermove', onMove, true);
      document.addEventListener('pointerup', onUp, true);
    });
  }

  bindDeleteButton(button, ctx, el, rowIndex, blockIndex) {
    let armed = false;
    let timer = null;
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!armed) {
        armed = true;
        button.classList.add('is-confirming');
        button.textContent = 'confirm';
        timer = window.setTimeout(() => {
          armed = false;
          button.classList.remove('is-confirming');
          button.textContent = '×';
        }, 3000);
        return;
      }
      window.clearTimeout(timer);
      await this.deleteBlockFromSource(ctx, el, rowIndex, blockIndex);
    });
  }

  bindEditableBlock(card, ctx, el, rowIndex, blockIndex, inputs) {
    let isComposing = false;
    let saveTimer = null;

    const allInputs = [inputs.iconInput, inputs.titleInput, inputs.subtitleInput, inputs.contentInput];
    const save = async () => {
      await this.updateBlockText(ctx, el, rowIndex, blockIndex, {
        title: inputs.titleInput.value,
        icon: inputs.iconInput.value,
        subtitle: inputs.subtitleInput.value,
        body: inputs.contentInput.value,
      });
    };

    const saveAndPreview = async () => {
      if (isComposing) return;
      const body = inputs.contentInput.value;
      await save();
      await this.renderBodyPreview(body, inputs.preview, ctx);
      inputs.contentInput.hide();
      inputs.preview.show();
    };

    allInputs.forEach((input) => {
      input.addEventListener('compositionstart', () => { isComposing = true; });
      input.addEventListener('compositionend', () => { isComposing = false; });
    });

    card.addEventListener('focusout', () => {
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(async () => {
        if (card.contains(document.activeElement)) return;
        await saveAndPreview();
      }, 60);
    });

    inputs.contentInput.addEventListener('keydown', async (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        await saveAndPreview();
      }
    });
  }

  async appendBlockToRow(ctx, el, rowIndex) {
    try {
      const section = await this.getCodeSection(ctx, el);
      const source = section.lines.slice(section.start + 1, section.end).join('\n');
      const nextSource = appendBlockInSource(source, rowIndex);
      await this.replaceCodeSection(section, nextSource);
    } catch (error) {
      console.error(error);
      new Notice(error.message || 'Failed to add block.');
    }
  }

  async appendBlockAsNewRow(ctx, el, rowIndex) {
    try {
      const section = await this.getCodeSection(ctx, el);
      const source = section.lines.slice(section.start + 1, section.end).join('\n');
      const nextSource = appendRowInSource(source, rowIndex);
      await this.replaceCodeSection(section, nextSource);
    } catch (error) {
      console.error(error);
      new Notice(error.message || 'Failed to add row.');
    }
  }

  async moveBlock(ctx, el, from, target) {
    const section = await this.getCodeSection(ctx, el);
    const source = section.lines.slice(section.start + 1, section.end).join('\n');
    const nextSource = moveBlockInSource(source, from, target);
    await this.replaceCodeSection(section, nextSource);
  }

  async deleteBlockFromSource(ctx, el, rowIndex, blockIndex) {
    try {
      const section = await this.getCodeSection(ctx, el);
      const source = section.lines.slice(section.start + 1, section.end).join('\n');
      const nextSource = deleteBlockInSource(source, rowIndex, blockIndex);
      await this.replaceCodeSection(section, nextSource);
    } catch (error) {
      console.error(error);
      new Notice(error.message || 'Failed to delete block.');
    }
  }

  async updateBlockText(ctx, el, rowIndex, blockIndex, data) {
    try {
      const section = await this.getCodeSection(ctx, el);
      const source = section.lines.slice(section.start + 1, section.end).join('\n');
      const nextSource = updateBlockTextInSource(source, rowIndex, blockIndex, data);
      await this.replaceCodeSection(section, nextSource);
    } catch (error) {
      console.error(error);
      new Notice(error.message || 'Failed to save block.');
    }
  }

  async updateBlockOptions(ctx, el, rowIndex, blockIndex, patch) {
    try {
      const section = await this.getCodeSection(ctx, el);
      const source = section.lines.slice(section.start + 1, section.end).join('\n');
      const nextSource = updateBlockOptionsInSource(source, rowIndex, blockIndex, patch);
      await this.replaceCodeSection(section, nextSource);
    } catch (error) {
      console.error(error);
      new Notice(error.message || 'Failed to save layout.');
    }
  }

  async getCodeSection(ctx, el) {
    const file = ctx.sourcePath ? this.app.vault.getAbstractFileByPath(ctx.sourcePath) : this.app.workspace.getActiveFile();
    if (!file) throw new Error('Cannot find current file.');
    const text = await this.app.vault.read(file);
    const lines = text.split('\n');
    const info = ctx.getSectionInfo ? ctx.getSectionInfo(el) : null;
    if (!info) throw new Error('Cannot locate this code block.');
    let start = info.lineStart;
    while (start >= 0 && !/^```\s*(drag-layout|drag-cols)\s*$/i.test(lines[start] || '')) start -= 1;
    if (start < 0) throw new Error('Cannot locate code fence start.');
    let end = start + 1;
    while (end < lines.length && !/^```\s*$/.test(lines[end] || '')) end += 1;
    return { file, lines, start, end };
  }

  async replaceCodeSection(section, nextSource) {
    const nextText = [
      ...section.lines.slice(0, section.start + 1),
      ...nextSource.split('\n'),
      ...section.lines.slice(section.end),
    ].join('\n');
    await this.app.vault.modify(section.file, nextText);
  }
};

class DragAndDropColumnsSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Drag and Drop Columns' });
    containerEl.createEl('p', { text: 'Rows are explicit and each row can contain up to 3 blocks.' });
    this.addTextSetting(containerEl, 'Default gap', 'defaultGap', 'Example: 14px.');
    this.addTextSetting(containerEl, 'Title font size', 'defaultTitleSize', 'Example: 1.05em.');
    this.addTextSetting(containerEl, 'Body font size', 'defaultBodySize', 'Example: 1em.');
    this.addTextSetting(containerEl, 'Card radius', 'defaultRadius', 'Example: 12px.');
  }

  addTextSetting(containerEl, name, key, desc) {
    new Setting(containerEl)
      .setName(name)
      .setDesc(desc)
      .addText((text) => text
        .setPlaceholder(DEFAULT_SETTINGS[key] || '')
        .setValue(this.plugin.settings[key] || '')
        .onChange(async (value) => {
          this.plugin.settings[key] = value.trim();
          await this.plugin.saveSettings();
        }));
  }
}

function parseLayoutSource(source) {
  const parts = splitSourceIntoParts(source);
  const options = parseGlobalOptions(parts.header);
  return { options, rows: parts.rows };
}

function parseGlobalOptions(header) {
  const options = {};
  header.split(/\r?\n/).forEach((line) => {
    const option = parseOptionLine(line, GLOBAL_ALIASES);
    if (option) options[option.key] = option.value;
  });
  return options;
}

function splitSourceIntoParts(source) {
  const normalized = source
    .replace(/\r\n/g, '\n')
    .replace(/^```drag-(layout|cols)\s*/i, '')
    .replace(/```\s*$/i, '')
    .trimEnd();
  const lines = normalized ? normalized.split('\n') : [];
  const firstBlock = lines.findIndex((line) => /^---\s*$/.test(line));
  const header = firstBlock >= 0 ? lines.slice(0, firstBlock).join('\n').trimEnd() : normalized;
  const hasExplicitRows = firstBlock >= 0 && lines.slice(firstBlock).some((line) => /^={3,}\s*$/.test(line));
  const rows = [];
  let currentRow = { blocks: [] };
  let currentBlock = null;

  const pushBlock = () => {
    if (currentBlock === null) return;
    const content = currentBlock.join('\n').trim();
    if (content) currentRow.blocks.push({ content });
    currentBlock = null;
  };

  const pushRow = () => {
    pushBlock();
    if (currentRow.blocks.length) rows.push(currentRow);
    currentRow = { blocks: [] };
  };

  if (firstBlock >= 0) {
    for (let i = firstBlock; i < lines.length; i += 1) {
      const line = lines[i];
      if (/^={3,}\s*$/.test(line)) {
        pushRow();
      } else if (/^---\s*$/.test(line)) {
        pushBlock();
        currentBlock = [];
      } else if (currentBlock !== null) {
        currentBlock.push(line);
      }
    }
    pushRow();
  }

  return { header, rows: normalizeRows(rows, hasExplicitRows) };
}

function normalizeRows(rows, hasExplicitRows) {
  if (hasExplicitRows) return chunkRows(rows);
  const blocks = rows.flatMap((row) => row.blocks || []);
  if (!blocks.length) return [];

  const hasCanvasPosition = blocks.some((block) => {
    const opts = parseBlockContent(block.content).options;
    return opts.x || opts.y;
  });

  if (!hasCanvasPosition) return chunkFlatBlocks(blocks);
  return groupCanvasBlocksIntoRows(blocks);
}

function chunkRows(rows) {
  const out = [];
  rows.forEach((row) => {
    const blocks = (row.blocks || []).filter(Boolean);
    for (let i = 0; i < blocks.length; i += MAX_BLOCKS_PER_ROW) {
      out.push({ blocks: blocks.slice(i, i + MAX_BLOCKS_PER_ROW) });
    }
  });
  return out;
}

function chunkFlatBlocks(blocks) {
  const out = [];
  for (let i = 0; i < blocks.length; i += MAX_BLOCKS_PER_ROW) {
    out.push({ blocks: blocks.slice(i, i + MAX_BLOCKS_PER_ROW) });
  }
  return out;
}

function groupCanvasBlocksIntoRows(blocks) {
  const sorted = blocks.map((block, index) => {
    const options = parseBlockContent(block.content).options;
    return {
      block,
      index,
      x: parseCssPx(options.x, index * 260),
      y: parseCssPx(options.y, Math.floor(index / MAX_BLOCKS_PER_ROW) * 230),
    };
  }).sort((a, b) => (a.y - b.y) || (a.x - b.x) || (a.index - b.index));

  const rows = [];
  sorted.forEach((item) => {
    let row = rows[rows.length - 1];
    if (!row || row.blocks.length >= MAX_BLOCKS_PER_ROW || Math.abs(item.y - row.baseY) > ROW_GROUP_TOLERANCE) {
      row = { baseY: item.y, items: [], blocks: [] };
      rows.push(row);
    }
    row.items.push(item);
    row.blocks.push(item.block);
    row.baseY = Math.min(row.baseY, item.y);
  });

  rows.forEach((row) => {
    row.blocks = row.items.sort((a, b) => (a.x - b.x) || (a.index - b.index)).map((item) => item.block);
    delete row.items;
    delete row.baseY;
  });
  return rows;
}

function buildSourceFromParts(parts) {
  const rows = chunkRows(parts.rows || []);
  const rowTexts = rows
    .filter((row) => row.blocks.length)
    .map((row) => row.blocks.map((block) => `---\n${block.content.trimEnd()}`).join('\n\n'));
  return [parts.header, rowTexts.join('\n\n===\n\n')]
    .filter((part) => part && part.trim())
    .join('\n\n');
}

function parseBlockContent(blockContent) {
  const lines = blockContent.replace(/\r\n/g, '\n').split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  const options = {};
  let bodyStart = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      bodyStart = i + 1;
      break;
    }
    const parsed = parseOptionLine(lines[i], BLOCK_ALIASES);
    if (!parsed) {
      bodyStart = i;
      break;
    }
    options[parsed.key] = parsed.value;
    bodyStart = i + 1;
  }

  return { options, body: lines.slice(bodyStart).join('\n').trimEnd() };
}

function buildBlockContent(options, body) {
  const order = [
    'title', 'icon', 'subtitle', 'x', 'y', 'width', 'height',
    'cardBackground', 'titleColor', 'titleBackground', 'textColor', 'accentColor',
    'titleSize', 'bodySize', 'radius',
  ];
  const names = {
    cardBackground: 'bg',
    titleBackground: 'titleBg',
    textColor: 'color',
    accentColor: 'accent',
  };
  const always = new Set(['title', 'icon']);
  const lines = [];
  order.forEach((key) => {
    if (!always.has(key) && (options[key] === undefined || options[key] === null || options[key] === '')) return;
    lines.push(`${names[key] || key}: ${options[key] || ''}`);
  });
  return `${lines.join('\n')}\n\n${body || ''}`.trimEnd();
}

function updateBlockTextInSource(source, rowIndex, blockIndex, data) {
  const parts = splitSourceIntoParts(source);
  const block = getBlockAt(parts.rows, rowIndex, blockIndex);
  const parsed = parseBlockContent(block.content);
  parsed.options.title = data.title || '';
  parsed.options.icon = data.icon || '';
  if (data.subtitle) parsed.options.subtitle = data.subtitle;
  else delete parsed.options.subtitle;
  block.content = buildBlockContent(parsed.options, (data.body || '').replace(/\r\n/g, '\n').trimEnd());
  return buildSourceFromParts(parts);
}

function updateBlockOptionsInSource(source, rowIndex, blockIndex, patch) {
  const parts = splitSourceIntoParts(source);
  const block = getBlockAt(parts.rows, rowIndex, blockIndex);
  const parsed = parseBlockContent(block.content);
  Object.assign(parsed.options, patch);
  block.content = buildBlockContent(parsed.options, parsed.body);
  return buildSourceFromParts(parts);
}

function appendBlockInSource(source, rowIndex) {
  const parts = splitSourceIntoParts(source);
  if (!parts.rows.length) parts.rows.push({ blocks: [] });
  const safeRowIndex = clamp(rowIndex, 0, parts.rows.length - 1);
  const row = parts.rows[safeRowIndex];
  if (row.blocks.length >= MAX_BLOCKS_PER_ROW) throw new Error('Each row can contain up to 3 blocks.');
  const previousOptions = getPreviousOptions(row.blocks, parts.rows);
  row.blocks.push({ content: createEmptyBlockContent(countBlocks(parts.rows), previousOptions, getNextFreePosition(row.blocks)) });
  return buildSourceFromParts(parts);
}

function appendRowInSource(source, rowIndex) {
  const parts = splitSourceIntoParts(source);
  const insertAt = clamp(rowIndex, 0, parts.rows.length);
  const previousOptions = getPreviousOptions([], parts.rows);
  parts.rows.splice(insertAt, 0, { blocks: [{ content: createEmptyBlockContent(countBlocks(parts.rows), previousOptions, { x: 0, y: 0 }) }] });
  return buildSourceFromParts(parts);
}

function moveBlockInSource(source, from, target) {
  const parts = splitSourceIntoParts(source);
  const rows = parts.rows;
  if (!rows[from.rowIndex] || !rows[from.rowIndex].blocks[from.blockIndex]) throw new Error('Cannot find source block.');

  if (target.kind === 'row' && target.rowIndex === from.rowIndex) {
    patchBlockOptions(rows[from.rowIndex].blocks[from.blockIndex], {
      x: `${Math.max(0, Math.round(target.x || 0))}px`,
      y: `${Math.max(0, Math.round(target.y || 0))}px`,
    });
    return buildSourceFromParts(parts);
  }

  const [block] = rows[from.rowIndex].blocks.splice(from.blockIndex, 1);
  let removedEmptyRow = false;
  if (rows[from.rowIndex].blocks.length === 0) {
    rows.splice(from.rowIndex, 1);
    removedEmptyRow = true;
  }

  patchBlockOptions(block, {
    x: `${Math.max(0, Math.round(target.x || 0))}px`,
    y: `${Math.max(0, Math.round(target.y || 0))}px`,
  });

  if (target.kind === 'new-row') {
    let insertRow = target.rowIndex;
    if (removedEmptyRow && from.rowIndex < insertRow) insertRow -= 1;
    insertRow = clamp(insertRow, 0, rows.length);
    rows.splice(insertRow, 0, { blocks: [block] });
    return buildSourceFromParts(parts);
  }

  if (target.kind !== 'row') throw new Error('Unknown drop target.');

  let targetRowIndex = target.rowIndex;
  if (removedEmptyRow && from.rowIndex < targetRowIndex) targetRowIndex -= 1;
  if (!rows[targetRowIndex]) throw new Error('Cannot find target row.');
  if (rows[targetRowIndex].blocks.length >= MAX_BLOCKS_PER_ROW) {
    throw new Error('Each row can contain up to 3 blocks.');
  }

  const targetBlockIndex = clamp(target.blockIndex ?? rows[targetRowIndex].blocks.length, 0, rows[targetRowIndex].blocks.length);
  rows[targetRowIndex].blocks.splice(targetBlockIndex, 0, block);
  return buildSourceFromParts(parts);
}

function deleteBlockInSource(source, rowIndex, blockIndex) {
  const parts = splitSourceIntoParts(source);
  if (!parts.rows[rowIndex] || !parts.rows[rowIndex].blocks[blockIndex]) throw new Error('Cannot find block.');
  parts.rows[rowIndex].blocks.splice(blockIndex, 1);
  if (parts.rows[rowIndex].blocks.length === 0) parts.rows.splice(rowIndex, 1);
  return buildSourceFromParts(parts);
}

function getBlockAt(rows, rowIndex, blockIndex) {
  if (!rows[rowIndex] || !rows[rowIndex].blocks[blockIndex]) throw new Error('Cannot find block.');
  return rows[rowIndex].blocks[blockIndex];
}

function createInitialLayoutSource() {
  return ['```drag-layout', 'gap: 14px', '', '---', createEmptyBlockContent(0, null), '```', ''].join('\n');
}

function createEmptyBlockContent(index, previousOptions, position) {
  const c = getPaletteAvoiding(index, previousOptions && previousOptions.cardBackground);
  const pos = position || getDefaultBlockPosition(0);
  const options = {
    title: '',
    icon: '',
    x: `${Math.max(0, Math.round(pos.x || 0))}px`,
    y: `${Math.max(0, Math.round(pos.y || 0))}px`,
    width: previousOptions && previousOptions.width ? previousOptions.width : `${DEFAULT_CARD_WIDTH}px`,
    height: previousOptions && previousOptions.height ? previousOptions.height : `${DEFAULT_CARD_HEIGHT}px`,
    cardBackground: c.bg,
    titleColor: c.titleColor,
    titleBackground: c.titleBg,
    textColor: c.color,
    accentColor: c.accent,
  };
  ['titleSize', 'bodySize', 'radius'].forEach((key) => {
    if (previousOptions && previousOptions[key]) options[key] = previousOptions[key];
  });
  return buildBlockContent(options, '');
}

function getPreviousOptions(rowBlocks, allRows) {
  const previous = rowBlocks.length ? rowBlocks[rowBlocks.length - 1] : getLastBlock(allRows);
  return previous ? parseBlockContent(previous.content).options : null;
}

function getLastBlock(rows) {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const blocks = rows[i].blocks || [];
    if (blocks.length) return blocks[blocks.length - 1];
  }
  return null;
}

function countBlocks(rows) {
  return rows.reduce((count, row) => count + (row.blocks ? row.blocks.length : 0), 0);
}

function patchBlockOptions(block, patch) {
  const parsed = parseBlockContent(block.content);
  Object.assign(parsed.options, patch);
  block.content = buildBlockContent(parsed.options, parsed.body);
}

function getDefaultBlockPosition(index) {
  const gap = 16;
  if (index <= 0) return { x: 0, y: 0 };
  if (index === 1) return { x: DEFAULT_CARD_WIDTH + gap, y: 0 };
  return { x: 0, y: DEFAULT_CARD_HEIGHT + gap };
}

function getNextFreePosition(rowBlocks) {
  return getDefaultBlockPosition((rowBlocks || []).length);
}

function getRowInnerWidth(rowEl) {
  if (!rowEl) return DEFAULT_CARD_WIDTH;
  const style = window.getComputedStyle(rowEl);
  const paddingX = parseFloat(style.paddingLeft || '0') + parseFloat(style.paddingRight || '0');
  return Math.max(MIN_CARD_WIDTH, rowEl.clientWidth - paddingX);
}

function getCardLeftPx(card) {
  return Math.max(0, parseCssPx(card && card.style ? card.style.left : '', 0));
}

function getCardTopPx(card) {
  return Math.max(0, parseCssPx(card && card.style ? card.style.top : '', 0));
}

function adjustFreeRowHeight(rowEl) {
  if (!rowEl) return;
  const cards = Array.from(rowEl.querySelectorAll(':scope > .ddc-card'));
  let bottom = 0;
  cards.forEach((card) => {
    const top = getCardTopPx(card);
    const rect = card.getBoundingClientRect();
    const height = rect.height || parseCssPx(card.style.height, DEFAULT_CARD_HEIGHT);
    bottom = Math.max(bottom, top + height);
  });
  rowEl.style.height = `${Math.max(130, Math.ceil(bottom + 16))}px`;
}


function findDropTarget(root, clientX, clientY, drag = {}) {
  const element = document.elementFromPoint(clientX, clientY);
  if (!element || !root.contains(element)) return null;

  const zone = element.closest('.ddc-new-row-zone');
  if (zone && root.contains(zone)) {
    return { kind: 'new-row', rowIndex: Number(zone.dataset.rowInsert || 0), x: 0, y: 0 };
  }

  let rowEl = element.closest('.ddc-row');
  if (!rowEl) {
    const wrap = element.closest('.ddc-row-wrap');
    if (wrap) rowEl = wrap.querySelector('.ddc-row');
  }
  if (!rowEl || !root.contains(rowEl)) return null;

  const rowIndex = Number(rowEl.dataset.row || 0);
  const cards = Array.from(rowEl.querySelectorAll(':scope > .ddc-card'));
  const sourceRowIndex = Number.isFinite(Number(drag.rowIndex)) ? Number(drag.rowIndex) : -1;
  const targetBlockIndex = rowIndex === sourceRowIndex
    ? cards.findIndex((node) => Number(node.dataset.index || -1) === Number(drag.blockIndex))
    : cards.length;
  const rect = rowEl.getBoundingClientRect();
  const style = window.getComputedStyle(rowEl);
  const paddingLeft = parseFloat(style.paddingLeft || '0');
  const paddingTop = parseFloat(style.paddingTop || '0');
  const innerWidth = getRowInnerWidth(rowEl);
  const width = drag.width || DEFAULT_CARD_WIDTH;
  const offsetX = Number.isFinite(drag.offsetX) ? drag.offsetX : width / 2;
  const offsetY = Number.isFinite(drag.offsetY) ? drag.offsetY : 12;
  const maxX = Math.max(0, innerWidth - width);
  const x = clamp(Math.round(clientX - rect.left - paddingLeft - offsetX), 0, maxX);
  const y = Math.max(0, Math.round(clientY - rect.top - paddingTop - offsetY));

  return { kind: 'row', rowIndex, blockIndex: targetBlockIndex >= 0 ? targetBlockIndex : cards.length, x, y };
}

function showDropTarget(root, target, from) {
  clearDropIndicators(root);
  if (!target) return;

  if (target.kind === 'new-row') {
    const zone = root.querySelector(`.ddc-new-row-zone[data-row-insert="${target.rowIndex}"]`);
    if (zone) zone.addClass('is-over');
    return;
  }

  if (target.kind !== 'row') return;
  const rowEl = root.querySelector(`.ddc-row[data-row="${target.rowIndex}"]`);
  if (!rowEl) return;
  const cards = Array.from(rowEl.querySelectorAll(':scope > .ddc-card'));
  const isFullForeignRow = cards.length >= MAX_BLOCKS_PER_ROW && target.rowIndex !== from.rowIndex;
  rowEl.addClass(isFullForeignRow ? 'is-row-full' : 'is-row-over');
}

function clearDropIndicators(root) {
  root.querySelectorAll('.drop-before').forEach((node) => node.removeClass('drop-before'));
  root.querySelectorAll('.drop-after').forEach((node) => node.removeClass('drop-after'));
  root.querySelectorAll('.is-row-over').forEach((node) => node.removeClass('is-row-over'));
  root.querySelectorAll('.is-row-full').forEach((node) => node.removeClass('is-row-full'));
  root.querySelectorAll('.ddc-new-row-zone.is-over').forEach((node) => node.removeClass('is-over'));
}

function getMaxWidthForResize(card, rowEl) {
  const rowInnerWidth = getRowInnerWidth(rowEl);
  const left = getCardLeftPx(card);
  return Math.max(MIN_CARD_WIDTH, Math.floor(rowInnerWidth - left));
}


function parseOptionLine(line, aliases) {
  const match = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/);
  if (!match) return null;
  const normalized = match[1].toLowerCase().replace(/[\s_-]/g, '');
  const key = aliases[normalized];
  if (!key) return null;
  return { key, value: stripQuotes(match[2].trim()) };
}

function stripQuotes(value) {
  if (!value) return value;
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  return value;
}

function getPalette(index) {
  return PALETTE[((index % PALETTE.length) + PALETTE.length) % PALETTE.length];
}

function getPaletteAvoiding(index, avoidBg) {
  let color = getPalette(index);
  if (!avoidBg) return color;
  let guard = 0;
  while (color.bg.toLowerCase() === String(avoidBg).toLowerCase() && guard < PALETTE.length) {
    index += 1;
    color = getPalette(index);
    guard += 1;
  }
  return color;
}

function normalizeCssSize(value, fallback) {
  if (!value) return fallback;
  const raw = String(value).trim();
  if (!raw) return fallback;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return `${raw}px`;
  if (/^(auto|min-content|max-content|fit-content|\d+(\.\d+)?(px|rem|em|%|vw|vh|ch|lh|rlh))$/i.test(raw)) return raw;
  if (/^calc\([0-9a-z+\-*/().,%\s]+\)$/i.test(raw)) return raw;
  return fallback;
}

function parseCssPx(value, fallback) {
  if (!value) return fallback;
  const match = String(value).match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : fallback;
}

function setCssVar(el, name, value) {
  if (value === undefined || value === null || value === '') return;
  el.style.setProperty(name, value);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function extractFirstMarkdownHeading(markdown) {
  const lines = markdown.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (match) {
      lines.splice(i, 1);
      return { title: match[1].trim(), body: lines.join('\n').trim() };
    }
    if (lines[i].trim()) break;
  }
  return null;
}

function extractSubtitle(markdown) {
  const lines = markdown.split('\n');
  if (!lines.length) return null;
  const match = lines[0].match(/^\s*>\s*(.+)$/);
  if (!match) return null;
  lines.shift();
  return { subtitle: match[1].trim(), body: lines.join('\n').trim() };
}
