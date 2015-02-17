;(function ($, window, document, undefined) {

    'use strict';

    /** Default values */
    var pluginName = 'mediumInsert',
        defaults = {
            editor: null,
            enabled: true,
            addons: {
                images: true, // boolean or object containing configuration
                embeds: true
            }
        };

    /**
     * Capitalize first character
     *
     * @param {string} str
     * @return {string}
     */

    function ucfirst (str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    /**
     * Core plugin's object
     *
     * Sets options, variables and calls init() function
     *
     * @constructor
     * @param {DOM} el - DOM element to init the plugin on
     * @param {object} options - Options to override defaults
     * @return {void}
     */

    function Core (el, options) {
        var editor;

        this.el = el;
        this.$el = $(el);
        this.templates = window.MediumInsert.Templates;

        if (options) {
            // Fix #142
            // Avoid deep copying editor object, because since v2.3.0 it contains circular references which causes jQuery.extend to break
            // Instead copy editor object to this.options manually
            editor = options.editor;
            options.editor = null;
        }
        this.options = $.extend(true, {}, defaults, options);
        this.options.editor = editor;

        this._defaults = defaults;
        this._name = pluginName;

        // Extend editor's functions
        if (this.options && this.options.editor) {
            this.options.editor._serialize = this.options.editor.serialize;
            this.options.editor._deactivate = this.options.editor.deactivate;
            this.options.editor._activate = this.options.editor.activate;
            this.options.editor._hideInsertButtons = this.hideButtons;
            this.options.editor.serialize = this.editorSerialize;
            this.options.editor.deactivate = this.editorDeactivate;
            this.options.editor.activate = this.editorActivate;
            this.options.editor.activatePlaceholder = this.editorActivatePlaceholder;
        }

        this.init();
    }

    /**
     * Initialization
     *
     * @return {void}
     */

    Core.prototype.init = function () {
        this.$el.addClass('medium-editor-insert-plugin');

        if (typeof this.options.addons !== 'object' || Object.keys(this.options.addons).length === 0) {
            this.disable();
        }

        this.initAddons();
        this.clean();
        this.events();
    };

    /**
     * Event listeners
     *
     * @return {void}
     */

    Core.prototype.events = function () {
        this.$el
            .on('dragover drop', function (e) {
                e.preventDefault();
            })
            .on('blur', $.proxy(this, 'activatePlaceholder'))
            .on('keyup click', $.proxy(this, 'toggleButtons'))
            .on('selectstart mousedown', '.medium-insert, .medium-insert-buttons', $.proxy(this, 'disableSelection'))
            .on('keydown', $.proxy(this, 'fixSelectAll'))
            .on('click', '.medium-insert-buttons-show', $.proxy(this, 'toggleAddons'))
            .on('click', '.medium-insert-action', $.proxy(this, 'addonAction'));

        $(window).on('resize', $.proxy(this, 'positionButtons', null));
    };

    /**
     * Extend editor's serialize function
     *
     * @return {object} Serialized data
     */

    Core.prototype.editorSerialize = function () {
        var data = this._serialize();

        $.each(data, function (key) {
            var $data = $('<div />').html(data[key].value);

            $data.find('.medium-insert-buttons').remove();

            data[key].value = $data.html();
        });

        return data;
    };

    /**
     * Extend editor's deactivate function to deactivate this plugin too
     *
     * @return {void}
     */

    Core.prototype.editorDeactivate = function () {
        this._deactivate();

        $.each(this.elements, function (key, el) {
            $(el).data('plugin_' + pluginName).disable();
        });
    };

    /**
     * Extend editor's activate function to activate this plugin too
     *
     * @return {void}
     */

    Core.prototype.editorActivate = function () {
        this._activate();

        $.each(this.elements, function (key, el) {
            $(el).data('plugin_' + pluginName).enable();
        });
    };

    /**
     * Extend editor's activatePlaceholder function to activate placeholder dispite of the plugin buttons
     *
     * @return {void}
     */

    Core.prototype.editorActivatePlaceholder = function (el) {
        var $clone = $(el).clone(),
            cloneHtml;

        $clone.find('.medium-insert-buttons').remove();
        cloneHtml = $clone.html().replace(/^\s+|\s+$/g, '').replace(/^<p( class="medium-insert-active")?><br><\/p>$/, '');

        if (!(el.querySelector('img')) &&
            !(el.querySelector('blockquote')) &&
            cloneHtml === '') {

            el.classList.add('medium-editor-placeholder');
            this._hideInsertButtons($(el));
        }
    };

    /**
     * Activate placeholder
     *
     * @return {void}
     */

    Core.prototype.activatePlaceholder = function () {
        this.options.editor.activatePlaceholder(this.$el.get(0));
    };

    /**
     * Deselects selected text
     *
     * @return {void}
     */

    Core.prototype.deselect = function () {
        document.getSelection().removeAllRanges();
    };

    /**
     * Disables the plugin
     *
     * @return {void}
     */

    Core.prototype.disable = function () {
        this.options.enabled = false;

        this.$el.find('.medium-insert-buttons').addClass('hide');
    };

    /**
     * Enables the plugin
     *
     * @return {void}
     */

    Core.prototype.enable = function () {
        this.options.enabled = true;

        this.$el.find('.medium-insert-buttons').removeClass('hide');
    };

    /**
     * Disables selectstart mousedown events on plugin elements except images
     *
     * @return {void}
     */

    Core.prototype.disableSelection = function (e) {
        var $el = $(e.target);

        if ($el.is('img') === false || $el.hasClass('medium-insert-buttons-show')) {
            e.preventDefault();
        }
    };

    /**
     * Fix #39
     * For some reason Chrome doesn't "select-all", when the last placeholder is visible.
     * So it's needed to hide it when the user "selects all", and show it again when they presses any other key.
     *
     * @return {boolean} document.execCommand()
     */

    Core.prototype.fixSelectAll = function (e) {
        this.$el.children().last().removeClass('hide');

         if ((e.ctrlKey || e.metaKey) && e.which === 65) {
            e.preventDefault();

            if(this.$el.find('p').text().trim().length === 0) {
              return false;
            }

            this.$el.children().last().addClass('hide');

            return document.execCommand('selectAll', false, null);
        }
    };

    /**
     * Initialize addons
     *
     * @return {void}
     */

    Core.prototype.initAddons = function () {
        var that = this;

        $.each(this.options.addons, function (addon, options) {
            var addonName = pluginName + ucfirst(addon);

            if (options === false) {
                delete that.options.addons[addon];
                return;
            }

            that.$el[addonName](options);
            that.options.addons[addon] = that.$el.data('plugin_'+ addonName).options;
        });
    };

    /**
     * Cleans a content of the editor
     *
     * @return {void}
     */

    Core.prototype.clean = function () {
        var $buttons, $lastEl;

        if (this.options.enabled === false) {
            return;
        }

        // Fix #39
        // After deleting all content (ctrl+A and delete) in Firefox, all content is deleted and only <br> appears
        // To force placeholder to appear, set <p><br></p> as content of the $el
        if (this.$el.html().trim() === '' || this.$el.html().trim() === '<br>') {
            this.$el.html(this.templates['src/js/templates/core-empty-line.hbs']().trim());
        }

        // Fix #29
        // Wrap content text in <p></p> to avoid Firefox problems
        this.$el
            .contents()
            .filter(function () {
                return this.nodeName === '#text' && $.trim($(this).text()) !== '';
            })
            .wrap('<p />');

        this.addButtons();

        $buttons = this.$el.find('.medium-insert-buttons');
        $lastEl = $buttons.prev();
        if ($lastEl.attr('class') && $lastEl.attr('class').match(/medium\-insert(?!\-active)/)) {
            $buttons.before(this.templates['src/js/templates/core-empty-line.hbs']().trim());
        }
    };

    /**
     * Returns HTML template of buttons
     *
     * @return {string} HTML template of buttons
     */

    Core.prototype.getButtons = function () {
        if (this.options.enabled === false) {
            return;
        }

        return this.templates['src/js/templates/core-buttons.hbs']({
            addons: this.options.addons
        }).trim();
    };

    /**
     * Appends buttons at the end of the $el
     *
     * @return {void}
     */

    Core.prototype.addButtons = function () {
        if (this.$el.find('.medium-insert-buttons').length === 0) {
            this.$el.append(this.getButtons());
        }
    };

    /**
     * Move buttons to current active, empty paragraph and show them
     *
     * @return {void}
     */

    Core.prototype.toggleButtons = function (e) {
        var $el = $(e.target),
            selection = window.getSelection(),
            range = selection.getRangeAt(0),
            $current = $(range.commonAncestorContainer),
            $buttons = this.$el.find('.medium-insert-buttons'),
            isAddon = false,
            $p = $current.is('p') ? $current : $current.closest('p');

        this.clean();

        if ($el.hasClass('medium-editor-placeholder') === false && $el.closest('.medium-insert-buttons').length === 0 && $current.closest('.medium-insert-buttons').length === 0) {

            this.$el.find('.medium-insert-active').removeClass('medium-insert-active');

            $.each(this.options.addons, function (addon) {
                if ($el.closest('.medium-insert-'+ addon).length) {
                    $current = $el;
                    $p = $el.closest('.medium-insert-'+ addon);
                    isAddon = true;
                    return;
                }
            });

            if ($p.length && $p.text().trim() === '') {
                $p.addClass('medium-insert-active');

                if (isAddon === false) {
                    this.positionButtons($p);

                    $buttons.show();
                }
            } else {
                this.hideButtons();
            }
        }
    };

    /**
     * Hides buttons
     *
     * @param {jQuery} $el - Editor element
     * @returns {void}
     */

    Core.prototype.hideButtons = function ($el) {
        $el = $el || this.$el;

        $el.find('.medium-insert-buttons').hide();
        $el.find('.medium-insert-buttons-addons').hide();
    };

    /**
     * Position buttons
     *
     * @param {jQuery} $current - Current active element
     * @return {void}
     */

    Core.prototype.positionButtons = function ($current) {
        var $buttons = this.$el.find('.medium-insert-buttons'),
            $p = this.$el.find('.medium-insert-active'),
            left, top;

        // Left position is set according to an active paragraph
        if ($p.length) {
            left = $p.position().left - parseInt($buttons.find('.medium-insert-buttons-addons').css('left'), 10) - parseInt($buttons.find('.medium-insert-buttons-addons a:first').css('margin-left'), 10);
            left = left < 0 ? $p.position().left : left;
            $buttons.css('left', left);
        }

        if ($current) {
            // Top position is set according to a current active element
            top = $current.position().top + parseInt($current.css('margin-top'), 10);
            $buttons.css('top', top);
        }
    };

    /**
     * Toggles addons buttons
     *
     * @return {void}
     */

    Core.prototype.toggleAddons = function () {
        this.$el.find('.medium-insert-buttons-addons').toggle();
    };

    /**
     * Hide addons buttons
     *
     * @return {void}
     */

    Core.prototype.hideAddons = function () {
        this.$el.find('.medium-insert-buttons-addons').hide();
    };

    /**
     * Call addon's action
     *
     * @param {Event} e
     * @return {void}
     */

    Core.prototype.addonAction = function (e) {
        var $a = $(e.target).is('a') ? $(e.target) : $(e.target).closest('a'),
            addon = $a.data('addon'),
            action = $a.data('action');

        this.$el.data('plugin_'+ pluginName + ucfirst(addon))[action]();
    };

    /**
     * Move caret at the beginning of the empty paragraph
     *
     * @param {DOM} element Element where to place the caret
     *
     * @return {void}
     */

    Core.prototype.moveCaret = function (element) {
        var range, sel, el;

        range = document.createRange();
        sel = window.getSelection();
        el = element.get(0);

        if (!el.childNodes.length) {
            var textEl = document.createTextNode(' ');
            el.appendChild(textEl);
        }

        range.setStart(el.childNodes[0], 0);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
    };

    /** Plugin initialization */

    $.fn[pluginName] = function (options) {
        return this.each(function () {
            if (!$.data(this, 'plugin_' + pluginName)) {
                // Plugin initialization
                $.data(this, 'plugin_' + pluginName, new Core(this, options));
            } else if (typeof options === 'string' && $.data(this, 'plugin_' + pluginName)[options]) {
                // Method call
                $.data(this, 'plugin_' + pluginName)[options]();
            }
        });
    };

})(jQuery, window, document);
