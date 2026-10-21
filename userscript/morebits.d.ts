/** Generated from https://raw.githubusercontent.com/wikimedia-gadgets/twinkle/master/src/morebits.js. Do not edit. */
export {};
declare global {
  interface Morebits {
    /**
     * Wiki-specific configurations for Morebits
     */
    l10n: Morebits_l10n;
    /**
     * Simple helper function to see what groups a user might belong.
     *
     * @param group - e.g. `sysop`, `extendedconfirmed`, etc.
     */
    userIsInGroup: Morebits_userIsInGroup;
    /**
     * Hardcodes whether the user is a sysop, used a lot.
     */
    userIsSysop: false | true;
    /**
     * Determines whether the current page is a redirect or soft redirect. Fails
     * to detect soft redirects on edit, history, etc. pages.  Will attempt to
     * detect Module:RfD, with the same failure points.
     */
    isPageRedirect: Morebits_isPageRedirect;
    /**
     * Stores a normalized (underscores converted to spaces) version of the
     * `wgPageName` variable.
     */
    pageNameNorm: string;
    /**
     * Create a string for use in regex matching a page name.  Accounts for
     * leading character's capitalization, underscores as spaces, and special
     * characters being escaped.  See also {@link Morebits.namespaceRegex}.
     *
     * @param pageName - Page name without namespace.
     * @return - For a page name `Foo bar`, returns the string `[Ff]oo[_ ]bar`.
     */
    pageNameRegex: Morebits_pageNameRegex;
    /**
     * Converts string or array of DOM nodes into an HTML fragment.
     * Wikilink syntax (`[[...]]`) is transformed into HTML anchor.
     * Used in Morebits.QuickForm and Morebits.Status
     */
    createHtml: Morebits_createHtml;
    /**
     * Create a string for use in regex matching all namespace aliases, regardless
     * of the capitalization and underscores/spaces.  Doesn't include the optional
     * leading `:`, but if there's more than one item, wraps the list in a
     * non-capturing group.  This means you can do `Morebits.namespaceRegex([4]) +
     * ':' + Morebits.pageNameRegex('Twinkle')` to match a full page.  Uses
     * {@link Morebits.pageNameRegex}.
     *
     * @param namespaces - Array of namespace numbers.  Unused/invalid
     * namespace numbers are silently discarded.
     * @example // returns '(?:[Ff][Ii][Ll][Ee]|[Ii][Mm][Aa][Gg][Ee])'
     * Morebits.namespaceRegex([6])
     * @return - Regex-suitable string of all namespace aliases.
     */
    namespaceRegex: Morebits_namespaceRegex;
    /**
     * Creation of simple and standard forms without much specific coding.
     *
     * @param event - Function to execute when form is submitted.
     * @param eventType - Type of the event.
     */
    QuickForm: Morebits_QuickForm;
    /**
     * Utilities to help process IP addresses.
     */
    ip: Morebits_ip;
    /**
     * Helper functions to manipulate strings.
     */
    string: Morebits_string;
    /**
     * Helper functions to manipulate arrays.
     */
    array: Morebits_array;
    /**
     * Utilities to enhance select2 menus. See twinklewarn, twinklexfd,
     * twinkleblock for sample usages.
     *
     * @see {@link https://select2.org/}
     * @requires jQuery.select2
     */
    select2: Morebits_select2;
    /**
     * Temporarily hide a part of a string while processing the rest of it.
     * Used by {@link Morebits.wikitext.Page#commentOutImage Morebits.wikitext.Page.commentOutImage}.
     *
     * @param string - The initial text to process.
     * @example var u = new Morebits.Unbinder('Hello world <!-- world --> world');
     * u.unbind('<!--', '-->'); // text inside comment remains intact
     * u.content = u.content.replace(/world/g, 'earth');
     * u.rebind(); // gives 'Hello earth <!-- world --> earth'
     */
    Unbinder: Morebits_Unbinder;
    /**
     * Create a date object with enhanced processing capabilities, a la
     * {@link https://momentjs.com/ moment.js}. MediaWiki timestamp format is also
     * acceptable, in addition to everything that JS Date() accepts.
     */
    Date: Morebits_Date;
    /**
     * Various objects for wiki editing and API access, including
     * {@link Morebits.wiki.Api} and {@link Morebits.wiki.Page}.
     */
    wiki: Morebits_wiki;
    /**
     * Wikitext manipulation.
     */
    wikitext: Morebits_wikitext;
    /**
     * Handles logging actions to a userspace log.
     * Used in CSD, PROD, and XFD.
     *
     * @param logPageName - Title of the subpage of the current user's log.
     */
    UserspaceLogger: Morebits_UserspaceLogger;
    /**
     * Create and show status messages of varying urgency.
     * {@link Morebits.Status.initMorebits.Status.init()} must be called before
     * any status object is created, otherwise those statuses won't be visible.
     *
     * @param text - Text before the the colon `:`.
     * @param stat - Text after the colon `:`.
     * @param type - Determine the font color of the status
     * line, allowable values are: `status` (blue), `info` (green), `warn` (red),
     * or `error` (bold red).
     */
    Status: Morebits_Status;
    /**
     * Simple helper function to create a simple node.
     *
     * @param type - Type of HTML element.
     * @param content - Text content.
     * @param color - Font color.
     */
    htmlNode: Morebits_htmlNode;
    /**
     * Add shift-click support for checkboxes. The wikibits version
     * (`window.addCheckboxClickHandlers`) has some restrictions, and doesn't work
     * with checkboxes inside a sortable table, so let's build our own.
     */
    checkboxShiftClickSupport: Morebits_checkboxShiftClickSupport;
    /**
     * Iterates over a group of pages (or arbitrary objects) and executes a worker function
     * for each.
     *
     * `setPageList(pageList)`: Sets the list of pages to work on. It should be an
     * array of page names strings.
     *
     * `setOption(optionName, optionValue)`: Sets a known option:
     * - `chunkSize` (integer): The size of chunks to break the array into (default
     * 50). Setting this to a small value (<5) can cause problems.
     * - `preserveIndividualStatusLines` (boolean): Keep each page's status element
     * visible when worker is complete? See note below.
     *
     * `run(worker, postFinish)`: Runs the callback `worker` for each page in the
     * list.  The callback must call `workerSuccess` when succeeding, or
     * `workerFailure` when failing.  If using {@link Morebits.wiki.Api} or
     * {@link Morebits.wiki.Page}, this is easily done by passing these two
     * functions as parameters to the methods on those objects: for instance,
     * `page.save(batchOp.workerSuccess, batchOp.workerFailure)`.  Make sure the
     * methods are called directly if special success/failure cases arise.  If you
     * omit to call these methods, the batch operation will stall after the first
     * chunk!  Also ensure that either workerSuccess or workerFailure is called no
     * more than once.  The second callback `postFinish` is executed when the
     * entire batch has been processed.
     *
     * If using `preserveIndividualStatusLines`, you should try to ensure that the
     * `workerSuccess` callback has access to the page title.  This is no problem for
     * {@link Morebits.wiki.Page} objects.  But when using the API, please set the
     * |pageName| property on the {@link Morebits.wiki.Api} object.
     *
     * There are sample batchOperation implementations using Morebits.wiki.Page in
     * twinklebatchdelete.js, twinklebatchundelete.js, and twinklebatchprotect.js.
     */
    BatchOperation: Morebits_BatchOperation;
    /**
     * Given a set of asynchronous functions to run along with their dependencies,
     * run them in an efficient sequence so that multiple functions
     * that don't depend on each other are triggered simultaneously. Where
     * dependencies exist, it ensures that the dependency functions finish running
     * before the dependent function runs. The values resolved by the dependencies
     * are made available to the dependant as arguments.
     */
    TaskManager: Morebits_TaskManager;
    /**
     * A simple draggable window. No longer uses jQuery UI.
     *
     * @param height - The maximum allowable height for the content area.
     */
    SimpleWindow: Morebits_SimpleWindow;
    batchOperation: Morebits_BatchOperation;
    date: Morebits_Date;
    quickForm: Morebits_QuickForm;
    simpleWindow: Morebits_SimpleWindow;
    status: Morebits_Status;
    taskManager: Morebits_TaskManager;
    unbinder: Morebits_Unbinder;
    userspaceLogger: Morebits_UserspaceLogger;
  }
  interface Morebits_l10n {
    /**
     * Local aliases for "redirect" magic word.
     * Check using api.php?action=query&format=json&meta=siteinfo&formatversion=2&siprop=magicwords
     */
    redirectTagAliases: string[];
    /**
     * Takes a string as argument and checks if it is a timestamp or not
     * If not, it returns null. If yes, it returns an array of integers
     * in the format [year, month, date, hour, minute, second]
     * which can be passed to Date.UTC()
     */
    signatureTimestampFormat: Morebits_l10n_signatureTimestampFormat;
  }
  interface Morebits_l10n_signatureTimestampFormat {
    /**
     * Takes a string as argument and checks if it is a timestamp or not
     * If not, it returns null. If yes, it returns an array of integers
     * in the format [year, month, date, hour, minute, second]
     * which can be passed to Date.UTC()
     */
    (str: string): number[];
  }
  interface Morebits_userIsInGroup {
    /**
     * Simple helper function to see what groups a user might belong.
     *
     * @param group - e.g. `sysop`, `extendedconfirmed`, etc.
     */
    (group: string): false | true;
  }
  interface Morebits_isPageRedirect {
    /**
     * Determines whether the current page is a redirect or soft redirect. Fails
     * to detect soft redirects on edit, history, etc. pages.  Will attempt to
     * detect Module:RfD, with the same failure points.
     */
    (): false | true;
  }
  interface Morebits_pageNameRegex {
    /**
     * Create a string for use in regex matching a page name.  Accounts for
     * leading character's capitalization, underscores as spaces, and special
     * characters being escaped.  See also {@link Morebits.namespaceRegex}.
     *
     * @param pageName - Page name without namespace.
     * @return - For a page name `Foo bar`, returns the string `[Ff]oo[_ ]bar`.
     */
    (pageName: string): string;
  }
  interface Morebits_createHtml {
    /**
     * Converts string or array of DOM nodes into an HTML fragment.
     * Wikilink syntax (`[[...]]`) is transformed into HTML anchor.
     * Used in Morebits.QuickForm and Morebits.Status
     */
    (input: string | Node | (string | Node)[]): DocumentFragment;
    /**
     * Converts wikilinks to HTML anchor tags.
     */
    renderWikilinks: Morebits_createHtml_renderWikilinks;
  }
  interface Morebits_createHtml_renderWikilinks {
    /**
     * Converts wikilinks to HTML anchor tags.
     */
    (text: string): string;
  }
  interface Morebits_namespaceRegex {
    /**
     * Create a string for use in regex matching all namespace aliases, regardless
     * of the capitalization and underscores/spaces.  Doesn't include the optional
     * leading `:`, but if there's more than one item, wraps the list in a
     * non-capturing group.  This means you can do `Morebits.namespaceRegex([4]) +
     * ':' + Morebits.pageNameRegex('Twinkle')` to match a full page.  Uses
     * {@link Morebits.pageNameRegex}.
     *
     * @param namespaces - Array of namespace numbers.  Unused/invalid
     * namespace numbers are silently discarded.
     * @example // returns '(?:[Ff][Ii][Ll][Ee]|[Ii][Mm][Aa][Gg][Ee])'
     * Morebits.namespaceRegex([6])
     * @return - Regex-suitable string of all namespace aliases.
     */
    (namespaces: number[]): string;
  }
  interface Morebits_QuickForm {
    /**
     * Creation of simple and standard forms without much specific coding.
     *
     * @param event - Function to execute when form is submitted.
     * @param eventType - Type of the event.
     */
    new (event: Event, eventType: string): Morebits_QuickForm_Instance;
    /**
     * Creation of simple and standard forms without much specific coding.
     *
     * @param event - Function to execute when form is submitted.
     * @param eventType - Type of the event.
     */
    (event: Event, eventType: string): void;
    /**
     * Create a new element for the the form.
     *
     * Index to Morebits.QuickForm.Element types:
     * - Global attributes: id, className, style, tooltip, extra, $data, adminonly
     * - `select`: A combo box (aka drop-down).
     *     - Attributes: name, label, multiple, size, list, event, disabled
     *  - `option`: An element for a combo box.
     *      - Attributes: value, label, selected, disabled
     *  - `optgroup`: A group of "option"s.
     *      - Attributes: label, list
     *  - `field`: A fieldset (aka group box).
     *      - Attributes: name, label, disabled
     *  - `checkbox`: A checkbox. Must use "list" parameter.
     *      - Attributes: name, list, event
     *      - Attributes (within list): name, label, value, checked, disabled, event, subgroup
     *  - `radio`: A radio button. Must use "list" parameter.
     *      - Attributes: name, list, event
     *      - Attributes (within list): name, label, value, checked, disabled, event, subgroup
     *  - `input`: A text input box.
     *      - Attributes: name, label, value, size, placeholder, maxlength, disabled, required, readonly, event
     *  - `number`: A number input box.
     *      - Attributes: Everything the text `input` has, as well as: min, max, step, list
     *  - `dyninput`: A set of text boxes with "Remove" buttons and an "Add" button.
     *      - Attributes: name, label, min, max, inputs, sublabel, value, size, maxlength, event
     *  - `hidden`: An invisible form field.
     *      - Attributes: name, value
     *  - `header`: A level 5 header.
     *      - Attributes: label
     *  - `div`: A generic placeholder element or label.
     *      - Attributes: name, label
     *  - `submit`: A submit button. Morebits.SimpleWindow moves these to the footer of the dialog.
     *      - Attributes: name, label, disabled
     *  - `button`: A generic button.
     *      - Attributes: name, label, disabled, event
     *  - `textarea`: A big, multi-line text box.
     *      - Attributes: name, label, value, cols, rows, disabled, required, readonly
     *  - `fragment`: A DocumentFragment object.
     *      - No attributes, and no global attributes except adminonly.
     * There is some difference on how types handle the `label` attribute:
     * - `div`, `select`, `field`, `checkbox`/`radio`, `input`, `textarea`, `header`, and `dyninput` can accept an array of items,
     * and the label item(s) can be `Element`s.
     * - `option`, `optgroup`, `_dyninput_cell`, `submit`, and `button` accept only a single string.
     *
     * @param data - Object representing the quickform element. Should
     * specify one of the available types from the index above, as well as any
     * relevant and available attributes.
     * @example new Morebits.QuickForm.Element({
     * name: 'target',
     * type: 'input',
     * label: 'Your target:',
     * tooltip: 'Enter your target. Required.',
     * required: true
     * });
     */
    Element: Morebits_QuickForm_Element;
    $tooltip: any;
    /**
     * Returns an object containing all filled form data entered by the user, with the object
     * keys being the form element names. Disabled fields will be ignored, but not hidden fields.
     *
     * @return With field names as keys, input data as values.
     */
    getInputData: Morebits_QuickForm_getInputData;
    /**
     * Returns all form elements with a given field name or ID.
     *
     * @param fieldName - The name or id of the fields.
     * @return - Array of matching form elements.
     */
    getElements: Morebits_QuickForm_getElements;
    /**
     * Searches the array of elements for a checkbox or radio button with a certain
     * `value` attribute, and returns the first such element. Returns null if not found.
     *
     * @param elementArray - Array of checkbox or radio elements.
     * @param value - Value to search for.
     */
    getCheckboxOrRadio: Morebits_QuickForm_getCheckboxOrRadio;
    /**
     * Returns the &lt;div> containing the form element, or the form element itself
     * May not work as expected on checkboxes or radios.
     */
    getElementContainer: Morebits_QuickForm_getElementContainer;
    /**
     * Gets the HTML element that contains the label of the given form element
     * (mainly for internal use).
     */
    getElementLabelObject: Morebits_QuickForm_getElementLabelObject;
    /**
     * Gets the label text of the element.
     */
    getElementLabel: Morebits_QuickForm_getElementLabel;
    /**
     * Sets the label of the element to the given text.
     *
     * @return True if succeeded, false if the label element is unavailable.
     */
    setElementLabel: Morebits_QuickForm_setElementLabel;
    /**
     * Stores the element's current label, and temporarily sets the label to the given text.
     *
     * @return `true` if succeeded, `false` if the label element is unavailable.
     */
    overrideElementLabel: Morebits_QuickForm_overrideElementLabel;
    /**
     * Restores the label stored by overrideElementLabel.
     *
     * @return True if succeeded, false if the label element is unavailable.
     */
    resetElementLabel: Morebits_QuickForm_resetElementLabel;
    /**
     * Shows or hides a form element plus its label and tooltip.
     *
     * @param element - HTML/jQuery element, or jQuery selector string.
     * @param visibility - Skip this to toggle visibility.
     */
    setElementVisibility: Morebits_QuickForm_setElementVisibility;
    /**
     * Shows or hides the question mark icon (which displays the tooltip) next to a form element.
     *
     * @param visibility - Skip this to toggle visibility.
     */
    setElementTooltipVisibility: Morebits_QuickForm_setElementTooltipVisibility;
    prototype: Morebits_QuickForm_Instance;
  }
  interface Morebits_QuickForm_Instance {
    root: Morebits_QuickForm_Instance_root;
    /**
     * Renders the HTML output of the quickForm.
     */
    render: Morebits_QuickForm_Instance_render;
    /**
     * Append element to the form.
     *
     * @param data - A quickform element, or the object with which
     * a quickform element is constructed.
     * @return - Same as what is passed to the function.
     */
    append: Morebits_QuickForm_Instance_append;
  }
  interface Morebits_QuickForm_Instance_root {
    data: any;
    childs: any[];
    /**
     * Appends an element to current element.
     *
     * @param data - A quickForm element or the object required to
     * create the quickForm element.
     * @return The same element passed in.
     */
    append: Morebits_QuickForm_Instance_root_append;
    /**
     * Renders the HTML output for the quickForm element.  This should be called
     * without parameters: `form.render()`.
     */
    render: Morebits_QuickForm_Instance_root_render;
    compute: Morebits_QuickForm_Instance_root_compute;
  }
  interface Morebits_QuickForm_Instance_root_append {
    /**
     * Appends an element to current element.
     *
     * @param data - A quickForm element or the object required to
     * create the quickForm element.
     * @return The same element passed in.
     */
    (data: Morebits_QuickForm_Instance_root): Morebits_QuickForm_Instance_root;
  }
  interface Morebits_QuickForm_Instance_root_render {
    /**
     * Renders the HTML output for the quickForm element.  This should be called
     * without parameters: `form.render()`.
     */
    (internal_subgroup_id: any): HTMLElement;
  }
  interface Morebits_QuickForm_Instance_root_compute {
    (data: any, in_id: any): DocumentFragment[] | HTMLSpanElement[];
  }
  interface Morebits_QuickForm_Instance_render {
    /**
     * Renders the HTML output of the quickForm.
     */
    (): HTMLElement;
  }
  interface Morebits_QuickForm_Instance_append {
    /**
     * Append element to the form.
     *
     * @param data - A quickform element, or the object with which
     * a quickform element is constructed.
     * @return - Same as what is passed to the function.
     */
    (data: any): Morebits_QuickForm_Instance_root;
  }
  interface Morebits_QuickForm_Element {
    /**
     * Create a new element for the the form.
     *
     * Index to Morebits.QuickForm.Element types:
     * - Global attributes: id, className, style, tooltip, extra, $data, adminonly
     * - `select`: A combo box (aka drop-down).
     *     - Attributes: name, label, multiple, size, list, event, disabled
     *  - `option`: An element for a combo box.
     *      - Attributes: value, label, selected, disabled
     *  - `optgroup`: A group of "option"s.
     *      - Attributes: label, list
     *  - `field`: A fieldset (aka group box).
     *      - Attributes: name, label, disabled
     *  - `checkbox`: A checkbox. Must use "list" parameter.
     *      - Attributes: name, list, event
     *      - Attributes (within list): name, label, value, checked, disabled, event, subgroup
     *  - `radio`: A radio button. Must use "list" parameter.
     *      - Attributes: name, list, event
     *      - Attributes (within list): name, label, value, checked, disabled, event, subgroup
     *  - `input`: A text input box.
     *      - Attributes: name, label, value, size, placeholder, maxlength, disabled, required, readonly, event
     *  - `number`: A number input box.
     *      - Attributes: Everything the text `input` has, as well as: min, max, step, list
     *  - `dyninput`: A set of text boxes with "Remove" buttons and an "Add" button.
     *      - Attributes: name, label, min, max, inputs, sublabel, value, size, maxlength, event
     *  - `hidden`: An invisible form field.
     *      - Attributes: name, value
     *  - `header`: A level 5 header.
     *      - Attributes: label
     *  - `div`: A generic placeholder element or label.
     *      - Attributes: name, label
     *  - `submit`: A submit button. Morebits.SimpleWindow moves these to the footer of the dialog.
     *      - Attributes: name, label, disabled
     *  - `button`: A generic button.
     *      - Attributes: name, label, disabled, event
     *  - `textarea`: A big, multi-line text box.
     *      - Attributes: name, label, value, cols, rows, disabled, required, readonly
     *  - `fragment`: A DocumentFragment object.
     *      - No attributes, and no global attributes except adminonly.
     * There is some difference on how types handle the `label` attribute:
     * - `div`, `select`, `field`, `checkbox`/`radio`, `input`, `textarea`, `header`, and `dyninput` can accept an array of items,
     * and the label item(s) can be `Element`s.
     * - `option`, `optgroup`, `_dyninput_cell`, `submit`, and `button` accept only a single string.
     *
     * @param data - Object representing the quickform element. Should
     * specify one of the available types from the index above, as well as any
     * relevant and available attributes.
     * @example new Morebits.QuickForm.Element({
     * name: 'target',
     * type: 'input',
     * label: 'Your target:',
     * tooltip: 'Enter your target. Required.',
     * required: true
     * });
     */
    new (data: any): Morebits_QuickForm_Instance_root;
    /**
     * Create a new element for the the form.
     *
     * Index to Morebits.QuickForm.Element types:
     * - Global attributes: id, className, style, tooltip, extra, $data, adminonly
     * - `select`: A combo box (aka drop-down).
     *     - Attributes: name, label, multiple, size, list, event, disabled
     *  - `option`: An element for a combo box.
     *      - Attributes: value, label, selected, disabled
     *  - `optgroup`: A group of "option"s.
     *      - Attributes: label, list
     *  - `field`: A fieldset (aka group box).
     *      - Attributes: name, label, disabled
     *  - `checkbox`: A checkbox. Must use "list" parameter.
     *      - Attributes: name, list, event
     *      - Attributes (within list): name, label, value, checked, disabled, event, subgroup
     *  - `radio`: A radio button. Must use "list" parameter.
     *      - Attributes: name, list, event
     *      - Attributes (within list): name, label, value, checked, disabled, event, subgroup
     *  - `input`: A text input box.
     *      - Attributes: name, label, value, size, placeholder, maxlength, disabled, required, readonly, event
     *  - `number`: A number input box.
     *      - Attributes: Everything the text `input` has, as well as: min, max, step, list
     *  - `dyninput`: A set of text boxes with "Remove" buttons and an "Add" button.
     *      - Attributes: name, label, min, max, inputs, sublabel, value, size, maxlength, event
     *  - `hidden`: An invisible form field.
     *      - Attributes: name, value
     *  - `header`: A level 5 header.
     *      - Attributes: label
     *  - `div`: A generic placeholder element or label.
     *      - Attributes: name, label
     *  - `submit`: A submit button. Morebits.SimpleWindow moves these to the footer of the dialog.
     *      - Attributes: name, label, disabled
     *  - `button`: A generic button.
     *      - Attributes: name, label, disabled, event
     *  - `textarea`: A big, multi-line text box.
     *      - Attributes: name, label, value, cols, rows, disabled, required, readonly
     *  - `fragment`: A DocumentFragment object.
     *      - No attributes, and no global attributes except adminonly.
     * There is some difference on how types handle the `label` attribute:
     * - `div`, `select`, `field`, `checkbox`/`radio`, `input`, `textarea`, `header`, and `dyninput` can accept an array of items,
     * and the label item(s) can be `Element`s.
     * - `option`, `optgroup`, `_dyninput_cell`, `submit`, and `button` accept only a single string.
     *
     * @param data - Object representing the quickform element. Should
     * specify one of the available types from the index above, as well as any
     * relevant and available attributes.
     * @example new Morebits.QuickForm.Element({
     * name: 'target',
     * type: 'input',
     * label: 'Your target:',
     * tooltip: 'Enter your target. Required.',
     * required: true
     * });
     */
    (data: any): void;
    id: number;
    /**
     * Create a tooltip.
     *
     * @param node - The HTML element beside which a tooltip is to be generated.
     * @param data - Tooltip-related configuration data.
     */
    generateTooltip: Morebits_QuickForm_Element_generateTooltip;
    prototype: Morebits_QuickForm_Instance_root;
  }
  interface Morebits_QuickForm_Element_generateTooltip {
    /**
     * Create a tooltip.
     *
     * @param node - The HTML element beside which a tooltip is to be generated.
     * @param data - Tooltip-related configuration data.
     */
    (node: HTMLElement, data: any): void;
  }
  interface Morebits_QuickForm_getInputData {
    /**
     * Returns an object containing all filled form data entered by the user, with the object
     * keys being the form element names. Disabled fields will be ignored, but not hidden fields.
     *
     * @return With field names as keys, input data as values.
     */
    (form: HTMLFormElement): any;
  }
  interface Morebits_QuickForm_getElements {
    /**
     * Returns all form elements with a given field name or ID.
     *
     * @param fieldName - The name or id of the fields.
     * @return - Array of matching form elements.
     */
    (form: HTMLFormElement, fieldName: string): HTMLElement[];
  }
  interface Morebits_QuickForm_getCheckboxOrRadio {
    /**
     * Searches the array of elements for a checkbox or radio button with a certain
     * `value` attribute, and returns the first such element. Returns null if not found.
     *
     * @param elementArray - Array of checkbox or radio elements.
     * @param value - Value to search for.
     */
    (elementArray: HTMLInputElement[], value: string): HTMLInputElement;
  }
  interface Morebits_QuickForm_getElementContainer {
    /**
     * Returns the &lt;div> containing the form element, or the form element itself
     * May not work as expected on checkboxes or radios.
     */
    (element: HTMLElement): HTMLElement;
  }
  interface Morebits_QuickForm_getElementLabelObject {
    /**
     * Gets the HTML element that contains the label of the given form element
     * (mainly for internal use).
     */
    (element: Morebits_QuickForm_Instance_root | HTMLElement): HTMLElement;
  }
  interface Morebits_QuickForm_getElementLabel {
    /**
     * Gets the label text of the element.
     */
    (element: Morebits_QuickForm_Instance_root | HTMLElement): string;
  }
  interface Morebits_QuickForm_setElementLabel {
    /**
     * Sets the label of the element to the given text.
     *
     * @return True if succeeded, false if the label element is unavailable.
     */
    (
      element: Morebits_QuickForm_Instance_root | HTMLElement,
      labelText: string,
    ): false | true;
  }
  interface Morebits_QuickForm_overrideElementLabel {
    /**
     * Stores the element's current label, and temporarily sets the label to the given text.
     *
     * @return `true` if succeeded, `false` if the label element is unavailable.
     */
    (
      element: Morebits_QuickForm_Instance_root | HTMLElement,
      temporaryLabelText: string,
    ): false | true;
  }
  interface Morebits_QuickForm_resetElementLabel {
    /**
     * Restores the label stored by overrideElementLabel.
     *
     * @return True if succeeded, false if the label element is unavailable.
     */
    (element: Morebits_QuickForm_Instance_root | HTMLElement): false | true;
  }
  interface Morebits_QuickForm_setElementVisibility {
    /**
     * Shows or hides a form element plus its label and tooltip.
     *
     * @param element - HTML/jQuery element, or jQuery selector string.
     * @param visibility - Skip this to toggle visibility.
     */
    (
      element: string | HTMLElement | JQueryStatic,
      visibility: false | true,
    ): void;
  }
  interface Morebits_QuickForm_setElementTooltipVisibility {
    /**
     * Shows or hides the question mark icon (which displays the tooltip) next to a form element.
     *
     * @param visibility - Skip this to toggle visibility.
     */
    (element: HTMLElement | JQueryStatic, visibility: false | true): void;
  }
  interface Morebits_ip {
    /**
     * Converts an IPv6 address to the canonical form stored and used by MediaWiki.
     * JavaScript translation of the {@link https://gerrit.wikimedia.org/r/plugins/gitiles/mediawiki/core/+/8eb6ac3e84ea3312d391ca96c12c49e3ad0753bb/includes/utils/IP.php#131 `IP::sanitizeIP()`}
     * function from the IPUtils library.  Addresses are verbose, uppercase,
     * normalized, and expanded to 8 words.
     *
     * @param address - The IPv6 address, with or without CIDR.
     */
    sanitizeIPv6: Morebits_ip_sanitizeIPv6;
    /**
     * Determine if the given IP address is a range.  Just conjoins
     * `mw.util.isIPAddress` with and without the `allowBlock` option.
     *
     * @return - True if given a valid IP address range, false otherwise.
     */
    isRange: Morebits_ip_isRange;
    /**
     * Check that an IP range is within the CIDR limits.  Most likely to be useful
     * in conjunction with `wgRelevantUserName`.  CIDR limits are hardcoded as /16
     * for IPv4 and /32 for IPv6.
     *
     * @return - True for valid ranges within the CIDR limits,
     * otherwise false (ranges outside the limit, single IPs, non-IPs).
     */
    validCIDR: Morebits_ip_validCIDR;
    /**
     * Get the /64 subnet for an IPv6 address.
     *
     * @param ipv6 - The IPv6 address, with or without a subnet.
     * @return - False if not IPv6 or bigger than a 64,
     * otherwise the (sanitized) /64 address.
     */
    get64: Morebits_ip_get64;
  }
  interface Morebits_ip_sanitizeIPv6 {
    /**
     * Converts an IPv6 address to the canonical form stored and used by MediaWiki.
     * JavaScript translation of the {@link https://gerrit.wikimedia.org/r/plugins/gitiles/mediawiki/core/+/8eb6ac3e84ea3312d391ca96c12c49e3ad0753bb/includes/utils/IP.php#131 `IP::sanitizeIP()`}
     * function from the IPUtils library.  Addresses are verbose, uppercase,
     * normalized, and expanded to 8 words.
     *
     * @param address - The IPv6 address, with or without CIDR.
     */
    (address: string): string;
  }
  interface Morebits_ip_isRange {
    /**
     * Determine if the given IP address is a range.  Just conjoins
     * `mw.util.isIPAddress` with and without the `allowBlock` option.
     *
     * @return - True if given a valid IP address range, false otherwise.
     */
    (ip: string): false | true;
  }
  interface Morebits_ip_validCIDR {
    /**
     * Check that an IP range is within the CIDR limits.  Most likely to be useful
     * in conjunction with `wgRelevantUserName`.  CIDR limits are hardcoded as /16
     * for IPv4 and /32 for IPv6.
     *
     * @return - True for valid ranges within the CIDR limits,
     * otherwise false (ranges outside the limit, single IPs, non-IPs).
     */
    (ip: any): false | true;
  }
  interface Morebits_ip_get64 {
    /**
     * Get the /64 subnet for an IPv6 address.
     *
     * @param ipv6 - The IPv6 address, with or without a subnet.
     * @return - False if not IPv6 or bigger than a 64,
     * otherwise the (sanitized) /64 address.
     */
    (ipv6: string): string | false | true;
  }
  interface Morebits_string {
    toUpperCaseFirstChar: Morebits_string_toUpperCaseFirstChar;
    toLowerCaseFirstChar: Morebits_string_toLowerCaseFirstChar;
    /**
     * Gives an array of substrings of `str` - starting with `start` and
     * ending with `end` - which is not in `skiplist`.  Intended for use
     * on wikitext with templates or links.
     *
     * @throws {Error} If the `start` and `end` strings aren't of the same length.
     * @throws {Error} If `skiplist` isn't an array or string
     */
    splitWeightedByKeys: Morebits_string_splitWeightedByKeys;
    /**
     * Formats freeform "reason" (from a textarea) for deletion/other
     * templates that are going to be substituted, (e.g. PROD, XFD, RPP).
     * Handles `|` outside a nowiki tag.
     * Optionally, also adds a signature if not present already.
     */
    formatReasonText: Morebits_string_formatReasonText;
    /**
     * Formats a "reason" (from a textarea) for inclusion in a userspace
     * log.  Replaces newlines with {{Pb}}, and adds an extra `#` before
     * list items for proper formatting.
     */
    formatReasonForLog: Morebits_string_formatReasonForLog;
    /**
     * Like `String.prototype.replace()`, but escapes any dollar signs in
     * the replacement string.  Useful when the the replacement string is
     * arbitrary, such as a username or freeform user input, and could
     * contain dollar signs.
     *
     * @param string - Text in which to replace.
     */
    safeReplace: Morebits_string_safeReplace;
    /**
     * Determine if the user-provided expiration will be considered an
     * infinite-length by MW.
     *
     * @see {@link https://phabricator.wikimedia.org/T68646}
     */
    isInfinity: Morebits_string_isInfinity;
    /**
     * Escapes a string to be used in a RegExp, replacing spaces and
     * underscores with `[_ ]` as they are often equivalent.
     *
     * @param text - String to be escaped.
     * @return - The escaped text.
     */
    escapeRegExp: Morebits_string_escapeRegExp;
  }
  interface Morebits_string_toUpperCaseFirstChar {
    (str: string): string;
  }
  interface Morebits_string_toLowerCaseFirstChar {
    (str: string): string;
  }
  interface Morebits_string_splitWeightedByKeys {
    /**
     * Gives an array of substrings of `str` - starting with `start` and
     * ending with `end` - which is not in `skiplist`.  Intended for use
     * on wikitext with templates or links.
     *
     * @throws {Error} If the `start` and `end` strings aren't of the same length.
     * @throws {Error} If `skiplist` isn't an array or string
     */
    (
      str: string,
      start: string,
      end: string,
      skiplist: string | string[],
    ): string[];
  }
  interface Morebits_string_formatReasonText {
    /**
     * Formats freeform "reason" (from a textarea) for deletion/other
     * templates that are going to be substituted, (e.g. PROD, XFD, RPP).
     * Handles `|` outside a nowiki tag.
     * Optionally, also adds a signature if not present already.
     */
    (str: string, addSig: false | true): string;
  }
  interface Morebits_string_formatReasonForLog {
    /**
     * Formats a "reason" (from a textarea) for inclusion in a userspace
     * log.  Replaces newlines with {{Pb}}, and adds an extra `#` before
     * list items for proper formatting.
     */
    (str: string): string;
  }
  interface Morebits_string_safeReplace {
    /**
     * Like `String.prototype.replace()`, but escapes any dollar signs in
     * the replacement string.  Useful when the the replacement string is
     * arbitrary, such as a username or freeform user input, and could
     * contain dollar signs.
     *
     * @param string - Text in which to replace.
     */
    (string: string, pattern: string | RegExp, replacement: string): string;
  }
  interface Morebits_string_isInfinity {
    /**
     * Determine if the user-provided expiration will be considered an
     * infinite-length by MW.
     *
     * @see {@link https://phabricator.wikimedia.org/T68646}
     */
    (expiry: string): false | true;
  }
  interface Morebits_string_escapeRegExp {
    /**
     * Escapes a string to be used in a RegExp, replacing spaces and
     * underscores with `[_ ]` as they are often equivalent.
     *
     * @param text - String to be escaped.
     * @return - The escaped text.
     */
    (text: string): string;
  }
  interface Morebits_array {
    /**
     * Remove duplicated items from an array.
     *
     * @return A copy of the array with duplicates removed.
     * @throws {Error} When provided a non-array.
     */
    uniq: Morebits_array_uniq;
    /**
     * Remove non-duplicated items from an array.
     *
     * @return A copy of the array with the first instance of each value
     * removed; subsequent instances of those values (duplicates) remain.
     * @throws {Error} When provided a non-array.
     */
    dups: Morebits_array_dups;
    /**
     * Break up an array into smaller arrays.
     *
     * @param size - Size of each chunk (except the last, which could be different).
     * @return An array containing the smaller, chunked arrays.
     * @throws {Error} When provided a non-array.
     */
    chunk: Morebits_array_chunk;
  }
  interface Morebits_array_uniq {
    /**
     * Remove duplicated items from an array.
     *
     * @return A copy of the array with duplicates removed.
     * @throws {Error} When provided a non-array.
     */
    (arr: any[]): any[];
  }
  interface Morebits_array_dups {
    /**
     * Remove non-duplicated items from an array.
     *
     * @return A copy of the array with the first instance of each value
     * removed; subsequent instances of those values (duplicates) remain.
     * @throws {Error} When provided a non-array.
     */
    (arr: any[]): any[];
  }
  interface Morebits_array_chunk {
    /**
     * Break up an array into smaller arrays.
     *
     * @param size - Size of each chunk (except the last, which could be different).
     * @return An array containing the smaller, chunked arrays.
     * @throws {Error} When provided a non-array.
     */
    (arr: any[], size: number): any[][];
  }
  interface Morebits_select2 {
    matchers: Morebits_select2_matchers;
    /**
     * Underline matched part of options.
     */
    highlightSearchMatches: Morebits_select2_highlightSearchMatches;
    /**
     * Intercept query as it is happening, for use in highlightSearchMatches.
     */
    queryInterceptor: Morebits_select2_queryInterceptor;
    /**
     * Open dropdown and begin search when the `.select2-selection` has
     * focus and a key is pressed.
     *
     * @see {@link https://github.com/select2/select2/issues/3279#issuecomment-442524147}
     */
    autoStart: Morebits_select2_autoStart;
  }
  interface Morebits_select2_matchers {
    /**
     * Custom matcher in which if the optgroup name matches, all options in that
     * group are shown, like in jquery.chosen.
     */
    optgroupFull: Morebits_select2_matchers_optgroupFull;
    /**
     * Custom matcher that matches from the beginning of words only.
     */
    wordBeginning: Morebits_select2_matchers_wordBeginning;
  }
  interface Morebits_select2_matchers_optgroupFull {
    /**
     * Custom matcher in which if the optgroup name matches, all options in that
     * group are shown, like in jquery.chosen.
     */
    (params: any, data: any): any;
  }
  interface Morebits_select2_matchers_wordBeginning {
    /**
     * Custom matcher that matches from the beginning of words only.
     */
    (params: any, data: any): any;
  }
  interface Morebits_select2_highlightSearchMatches {
    /**
     * Underline matched part of options.
     */
    (data: any): any;
  }
  interface Morebits_select2_queryInterceptor {
    /**
     * Intercept query as it is happening, for use in highlightSearchMatches.
     */
    (params: any): void;
  }
  interface Morebits_select2_autoStart {
    /**
     * Open dropdown and begin search when the `.select2-selection` has
     * focus and a key is pressed.
     *
     * @see {@link https://github.com/select2/select2/issues/3279#issuecomment-442524147}
     */
    (ev: any): void;
  }
  interface Morebits_Unbinder {
    /**
     * Temporarily hide a part of a string while processing the rest of it.
     * Used by {@link Morebits.wikitext.Page#commentOutImage Morebits.wikitext.Page.commentOutImage}.
     *
     * @param string - The initial text to process.
     * @example var u = new Morebits.Unbinder('Hello world <!-- world --> world');
     * u.unbind('<!--', '-->'); // text inside comment remains intact
     * u.content = u.content.replace(/world/g, 'earth');
     * u.rebind(); // gives 'Hello earth <!-- world --> earth'
     */
    new (string: string): Morebits_Unbinder_Instance;
    /**
     * Temporarily hide a part of a string while processing the rest of it.
     * Used by {@link Morebits.wikitext.Page#commentOutImage Morebits.wikitext.Page.commentOutImage}.
     *
     * @param string - The initial text to process.
     * @example var u = new Morebits.Unbinder('Hello world <!-- world --> world');
     * u.unbind('<!--', '-->'); // text inside comment remains intact
     * u.content = u.content.replace(/world/g, 'earth');
     * u.rebind(); // gives 'Hello earth <!-- world --> earth'
     */
    (string: string): void;
    getCallback: Morebits_Unbinder_getCallback;
    prototype: Morebits_Unbinder_Instance;
  }
  interface Morebits_Unbinder_Instance {
    /**
     * The text being processed.
     */
    content: null;
    counter: null;
    history: null;
    prefix: null;
    postfix: null;
    /**
     * Hide the region encapsulated by the `prefix` and `postfix` from
     * string processing.  `prefix` and `postfix` will be used in a
     * RegExp, so items that need escaping should be use `\\`.
     *
     * @throws {Error} If either `prefix` or `postfix` is missing.
     */
    unbind: Morebits_Unbinder_Instance_unbind;
    /**
     * Restore the hidden portion of the `content` string.
     *
     * @return The processed output.
     */
    rebind: Morebits_Unbinder_Instance_rebind;
  }
  interface Morebits_Unbinder_Instance_unbind {
    new (): Morebits_Unbinder_Instance_unbind_Instance;
    /**
     * Hide the region encapsulated by the `prefix` and `postfix` from
     * string processing.  `prefix` and `postfix` will be used in a
     * RegExp, so items that need escaping should be use `\\`.
     *
     * @throws {Error} If either `prefix` or `postfix` is missing.
     */
    (prefix: string, postfix: string): void;
    prototype: Morebits_Unbinder_Instance_unbind_Instance;
  }
  interface Morebits_Unbinder_Instance_unbind_Instance {
    content: any;
  }
  interface Morebits_Unbinder_Instance_rebind {
    /**
     * Restore the hidden portion of the `content` string.
     *
     * @return The processed output.
     */
    (): string;
  }
  interface Morebits_Unbinder_getCallback {
    (self: any): Morebits_Unbinder_getCallback_Result;
  }
  interface Morebits_Unbinder_getCallback_Result {
    (match: any): any;
  }
  interface Morebits_Date {
    new (args: any[]): Morebits_Date_Instance;
    /**
     * Localized strings for date processing.
     *
     * @property {string[]} months
     * @property {string[]} monthsShort
     * @property {string[]} days
     * @property {string[]} daysShort
     * @property {object.<string, string>} relativeTimes
     */
    localeData: Record<string, string>;
    /**
     * Map units with getter/setter function names, for `add` and `subtract`
     * methods.
     *
     * @property {string} seconds
     * @property {string} minutes
     * @property {string} hours
     * @property {string} days
     * @property {string} weeks
     * @property {string} months
     * @property {string} years
     */
    unitMap: Record<string, string>;
    /**
     * Parses a string containing a date, and returns the number of milliseconds between that date and midnight, January 1, 1970.
     *
     * @param s A date string
     */
    parse: (s: string) => number;
    /**
     * Returns the number of milliseconds between midnight, January 1, 1970 Universal Coordinated Time (UTC) (or GMT) and the specified date.
     *
     * @param year The full year designation is required for cross-century date accuracy. If year is between 0 and 99 is used, then year is assumed to be 1900 + year.
     * @param monthIndex The month as a number between 0 and 11 (January to December).
     * @param date The date as a number between 1 and 31.
     * @param hours Must be supplied if minutes is supplied. A number from 0 to 23 (midnight to 11pm) that specifies the hour.
     * @param minutes Must be supplied if seconds is supplied. A number from 0 to 59 that specifies the minutes.
     * @param seconds Must be supplied if milliseconds is supplied. A number from 0 to 59 that specifies the seconds.
     * @param ms A number from 0 to 999 that specifies the milliseconds.
     * @param year The full year designation is required for cross-century date accuracy. If year is between 0 and 99 is used, then year is assumed to be 1900 + year.
     * @param monthIndex The month as a number between 0 and 11 (January to December).
     * @param date The date as a number between 1 and 31.
     * @param hours Must be supplied if minutes is supplied. A number from 0 to 23 (midnight to 11pm) that specifies the hour.
     * @param minutes Must be supplied if seconds is supplied. A number from 0 to 59 that specifies the minutes.
     * @param seconds Must be supplied if milliseconds is supplied. A number from 0 to 59 that specifies the seconds.
     * @param ms A number from 0 to 999 that specifies the milliseconds.
     */
    UTC: {
      (
        year: number,
        monthIndex: number,
        date?: number,
        hours?: number,
        minutes?: number,
        seconds?: number,
        ms?: number,
      ): number;
      (
        year: number,
        monthIndex?: number,
        date?: number,
        hours?: number,
        minutes?: number,
        seconds?: number,
        ms?: number,
      ): number;
    };
    /**
     * Returns the number of milliseconds elapsed since midnight, January 1, 1970 Universal Coordinated Time (UTC).
     */
    now: () => number;
    prototype: Morebits_Date_Instance;
  }
  interface Morebits_Date_Instance {
    isValid: Morebits_Date_Instance_isValid;
    isBefore: Morebits_Date_Instance_isBefore;
    isAfter: Morebits_Date_Instance_isAfter;
    getUTCMonthName: Morebits_Date_Instance_getUTCMonthName;
    getUTCMonthNameAbbrev: Morebits_Date_Instance_getUTCMonthNameAbbrev;
    getMonthName: Morebits_Date_Instance_getMonthName;
    getMonthNameAbbrev: Morebits_Date_Instance_getMonthNameAbbrev;
    getUTCDayName: Morebits_Date_Instance_getUTCDayName;
    getUTCDayNameAbbrev: Morebits_Date_Instance_getUTCDayNameAbbrev;
    getDayName: Morebits_Date_Instance_getDayName;
    getDayNameAbbrev: Morebits_Date_Instance_getDayNameAbbrev;
    /**
     * Add a given number of minutes, hours, days, weeks, months, or years to the date.
     * This is done in-place. The modified date object is also returned, allowing chaining.
     *
     * @param number - Should be an integer.
     * @throws {Error} If invalid or unsupported unit is given.
     */
    add: Morebits_Date_Instance_add;
    /**
     * Subtracts a given number of minutes, hours, days, weeks, months, or years to the date.
     * This is done in-place. The modified date object is also returned, allowing chaining.
     *
     * @param number - Should be an integer.
     * @throws {Error} If invalid or unsupported unit is given.
     */
    subtract: Morebits_Date_Instance_subtract;
    /**
     * Format the date into a string per the given format string.
     * Replacement syntax is a subset of that in moment.js:
     *
     * | Syntax | Output |
     * |--------|--------|
     * | H | Hours (24-hour) |
     * | HH | Hours (24-hour, padded to 2 digits) |
     * | h | Hours (12-hour) |
     * | hh | Hours (12-hour, padded to 2 digits) |
     * | A | AM or PM |
     * | m | Minutes |
     * | mm | Minutes (padded to 2 digits) |
     * | s | Seconds |
     * | ss | Seconds (padded to 2 digits) |
     * | SSS | Milliseconds fragment, 3 digits |
     * | d | Day number of the week (Sun=0) |
     * | ddd | Abbreviated day name |
     * | dddd | Full day name |
     * | D | Date |
     * | DD | Date (padded to 2 digits) |
     * | M | Month number (1-indexed) |
     * | MM | Month number (1-indexed, padded to 2 digits) |
     * | MMM | Abbreviated month name |
     * | MMMM | Full month name |
     * | Y | Year |
     * | YY | Final two digits of year (20 for 2020, 42 for 1942) |
     * | YYYY | Year (same as `Y`) |
     *
     * @param formatstr - Format the date into a string, using
     * the replacement syntax.  Use `[` and `]` to escape items.  If not
     * provided, will return the ISO-8601-formatted string.
     * @param zone - `system` (for browser-default time zone),
     * `utc`, or specify a time zone as number of minutes relative to UTC.
     */
    format: Morebits_Date_Instance_format;
    /**
     * Gives a readable relative time string such as "Yesterday at 6:43 PM" or "Last Thursday at 11:45 AM".
     * Similar to `calendar` in moment.js, but with time zone support.
     *
     * @param zone - 'system' (for browser-default time zone),
     * 'utc' (for UTC), or specify a time zone as number of minutes past UTC.
     */
    calendar: Morebits_Date_Instance_calendar;
    /**
     * Get a regular expression that matches wikitext section titles, such
     * as `==December 2019==` or `=== Jan 2018 ===`.
     */
    monthHeaderRegex: Morebits_Date_Instance_monthHeaderRegex;
    /**
     * Creates a wikitext section header with the month and year.
     *
     * @param level - Header level.  Pass 0 for just the text
     * with no wikitext markers (==).
     */
    monthHeader: Morebits_Date_Instance_monthHeader;
    /**
     * Returns a string representation of a date. The format of the string depends on the locale.
     */
    toString: () => string;
    /**
     * Returns a date as a string value.
     */
    toDateString: () => string;
    /**
     * Returns a time as a string value.
     */
    toTimeString: () => string;
    /**
     * Returns a value as a string value appropriate to the host environment's current locale.
     * Converts a date and time to a string by using the current or specified locale.
     *
     * @param locales A locale string or array of locale strings that contain one or more language or locale tags. If you include more than one locale string, list them in descending order of priority so that the first entry is the preferred locale. If you omit this parameter, the default locale of the JavaScript runtime is used.
     * @param options An object that contains one or more properties that specify comparison options.
     * @param locales A locale string, array of locale strings, Intl.Locale object, or array of Intl.Locale objects that contain one or more language or locale tags. If you include more than one locale string, list them in descending order of priority so that the first entry is the preferred locale. If you omit this parameter, the default locale of the JavaScript runtime is used.
     * @param options An object that contains one or more properties that specify comparison options.
     */
    toLocaleString: {
      (): string;
      (
        locales?: string | string[],
        options?: Intl.DateTimeFormatOptions,
      ): string;
      (
        locales?: Intl.LocalesArgument,
        options?: Intl.DateTimeFormatOptions,
      ): string;
    };
    /**
     * Returns a date as a string value appropriate to the host environment's current locale.
     * Converts a date to a string by using the current or specified locale.
     *
     * @param locales A locale string or array of locale strings that contain one or more language or locale tags. If you include more than one locale string, list them in descending order of priority so that the first entry is the preferred locale. If you omit this parameter, the default locale of the JavaScript runtime is used.
     * @param options An object that contains one or more properties that specify comparison options.
     * @param locales A locale string, array of locale strings, Intl.Locale object, or array of Intl.Locale objects that contain one or more language or locale tags. If you include more than one locale string, list them in descending order of priority so that the first entry is the preferred locale. If you omit this parameter, the default locale of the JavaScript runtime is used.
     * @param options An object that contains one or more properties that specify comparison options.
     */
    toLocaleDateString: {
      (): string;
      (
        locales?: string | string[],
        options?: Intl.DateTimeFormatOptions,
      ): string;
      (
        locales?: Intl.LocalesArgument,
        options?: Intl.DateTimeFormatOptions,
      ): string;
    };
    /**
     * Returns a time as a string value appropriate to the host environment's current locale.
     * Converts a time to a string by using the current or specified locale.
     *
     * @param locales A locale string or array of locale strings that contain one or more language or locale tags. If you include more than one locale string, list them in descending order of priority so that the first entry is the preferred locale. If you omit this parameter, the default locale of the JavaScript runtime is used.
     * @param options An object that contains one or more properties that specify comparison options.
     * @param locales A locale string, array of locale strings, Intl.Locale object, or array of Intl.Locale objects that contain one or more language or locale tags. If you include more than one locale string, list them in descending order of priority so that the first entry is the preferred locale. If you omit this parameter, the default locale of the JavaScript runtime is used.
     * @param options An object that contains one or more properties that specify comparison options.
     */
    toLocaleTimeString: {
      (): string;
      (
        locales?: string | string[],
        options?: Intl.DateTimeFormatOptions,
      ): string;
      (
        locales?: Intl.LocalesArgument,
        options?: Intl.DateTimeFormatOptions,
      ): string;
    };
    /**
     * Returns the stored time value in milliseconds since midnight, January 1, 1970 UTC.
     */
    valueOf: () => number;
    /**
     * Returns the stored time value in milliseconds since midnight, January 1, 1970 UTC.
     */
    getTime: () => number;
    /**
     * Gets the year, using local time.
     */
    getFullYear: () => number;
    /**
     * Gets the year using Universal Coordinated Time (UTC).
     */
    getUTCFullYear: () => number;
    /**
     * Gets the month, using local time.
     */
    getMonth: () => number;
    /**
     * Gets the month of a Date object using Universal Coordinated Time (UTC).
     */
    getUTCMonth: () => number;
    /**
     * Gets the day-of-the-month, using local time.
     */
    getDate: () => number;
    /**
     * Gets the day-of-the-month, using Universal Coordinated Time (UTC).
     */
    getUTCDate: () => number;
    /**
     * Gets the day of the week, using local time.
     */
    getDay: () => number;
    /**
     * Gets the day of the week using Universal Coordinated Time (UTC).
     */
    getUTCDay: () => number;
    /**
     * Gets the hours in a date, using local time.
     */
    getHours: () => number;
    /**
     * Gets the hours value in a Date object using Universal Coordinated Time (UTC).
     */
    getUTCHours: () => number;
    /**
     * Gets the minutes of a Date object, using local time.
     */
    getMinutes: () => number;
    /**
     * Gets the minutes of a Date object using Universal Coordinated Time (UTC).
     */
    getUTCMinutes: () => number;
    /**
     * Gets the seconds of a Date object, using local time.
     */
    getSeconds: () => number;
    /**
     * Gets the seconds of a Date object using Universal Coordinated Time (UTC).
     */
    getUTCSeconds: () => number;
    /**
     * Gets the milliseconds of a Date, using local time.
     */
    getMilliseconds: () => number;
    /**
     * Gets the milliseconds of a Date object using Universal Coordinated Time (UTC).
     */
    getUTCMilliseconds: () => number;
    /**
     * Gets the difference in minutes between Universal Coordinated Time (UTC) and the time on the local computer.
     */
    getTimezoneOffset: () => number;
    /**
     * Sets the date and time value in the Date object.
     *
     * @param time A numeric value representing the number of elapsed milliseconds since midnight, January 1, 1970 GMT.
     */
    setTime: (time: number) => number;
    /**
     * Sets the milliseconds value in the Date object using local time.
     *
     * @param ms A numeric value equal to the millisecond value.
     */
    setMilliseconds: (ms: number) => number;
    /**
     * Sets the milliseconds value in the Date object using Universal Coordinated Time (UTC).
     *
     * @param ms A numeric value equal to the millisecond value.
     */
    setUTCMilliseconds: (ms: number) => number;
    /**
     * Sets the seconds value in the Date object using local time.
     *
     * @param sec A numeric value equal to the seconds value.
     * @param ms A numeric value equal to the milliseconds value.
     */
    setSeconds: (sec: number, ms?: number) => number;
    /**
     * Sets the seconds value in the Date object using Universal Coordinated Time (UTC).
     *
     * @param sec A numeric value equal to the seconds value.
     * @param ms A numeric value equal to the milliseconds value.
     */
    setUTCSeconds: (sec: number, ms?: number) => number;
    /**
     * Sets the minutes value in the Date object using local time.
     *
     * @param min A numeric value equal to the minutes value.
     * @param sec A numeric value equal to the seconds value.
     * @param ms A numeric value equal to the milliseconds value.
     */
    setMinutes: (min: number, sec?: number, ms?: number) => number;
    /**
     * Sets the minutes value in the Date object using Universal Coordinated Time (UTC).
     *
     * @param min A numeric value equal to the minutes value.
     * @param sec A numeric value equal to the seconds value.
     * @param ms A numeric value equal to the milliseconds value.
     */
    setUTCMinutes: (min: number, sec?: number, ms?: number) => number;
    /**
     * Sets the hour value in the Date object using local time.
     *
     * @param hours A numeric value equal to the hours value.
     * @param min A numeric value equal to the minutes value.
     * @param sec A numeric value equal to the seconds value.
     * @param ms A numeric value equal to the milliseconds value.
     */
    setHours: (
      hours: number,
      min?: number,
      sec?: number,
      ms?: number,
    ) => number;
    /**
     * Sets the hours value in the Date object using Universal Coordinated Time (UTC).
     *
     * @param hours A numeric value equal to the hours value.
     * @param min A numeric value equal to the minutes value.
     * @param sec A numeric value equal to the seconds value.
     * @param ms A numeric value equal to the milliseconds value.
     */
    setUTCHours: (
      hours: number,
      min?: number,
      sec?: number,
      ms?: number,
    ) => number;
    /**
     * Sets the numeric day-of-the-month value of the Date object using local time.
     *
     * @param date A numeric value equal to the day of the month.
     */
    setDate: (date: number) => number;
    /**
     * Sets the numeric day of the month in the Date object using Universal Coordinated Time (UTC).
     *
     * @param date A numeric value equal to the day of the month.
     */
    setUTCDate: (date: number) => number;
    /**
     * Sets the month value in the Date object using local time.
     *
     * @param month A numeric value equal to the month. The value for January is 0, and other month values follow consecutively.
     * @param date A numeric value representing the day of the month. If this value is not supplied, the value from a call to the getDate method is used.
     */
    setMonth: (month: number, date?: number) => number;
    /**
     * Sets the month value in the Date object using Universal Coordinated Time (UTC).
     *
     * @param month A numeric value equal to the month. The value for January is 0, and other month values follow consecutively.
     * @param date A numeric value representing the day of the month. If it is not supplied, the value from a call to the getUTCDate method is used.
     */
    setUTCMonth: (month: number, date?: number) => number;
    /**
     * Sets the year of the Date object using local time.
     *
     * @param year A numeric value for the year.
     * @param month A zero-based numeric value for the month (0 for January, 11 for December). Must be specified if numDate is specified.
     * @param date A numeric value equal for the day of the month.
     */
    setFullYear: (year: number, month?: number, date?: number) => number;
    /**
     * Sets the year value in the Date object using Universal Coordinated Time (UTC).
     *
     * @param year A numeric value equal to the year.
     * @param month A numeric value equal to the month. The value for January is 0, and other month values follow consecutively. Must be supplied if numDate is supplied.
     * @param date A numeric value equal to the day of the month.
     */
    setUTCFullYear: (year: number, month?: number, date?: number) => number;
    /**
     * Returns a date converted to a string using Universal Coordinated Time (UTC).
     */
    toUTCString: () => string;
    /**
     * Returns a date as a string value in ISO format.
     */
    toISOString: () => string;
    /**
     * Used by the JSON.stringify method to enable the transformation of an object's data for JavaScript Object Notation (JSON) serialization.
     */
    toJSON: (key?: any) => string;
    /**
     * Converts a Date object to a string.
     * Converts a Date object to a number.
     * Converts a Date object to a string or number.
     *
     * @param hint The strings "number", "string", or "default" to specify what primitive to return.
     * @throws {TypeError} If 'hint' was given something other than "number", "string", or "default".
     * @returns A number if 'hint' was "number", a string if 'hint' was "string" or "default".
     */
    "__@toPrimitive@2707": {
      (hint: "default"): string;
      (hint: "string"): string;
      (hint: "number"): number;
      (hint: string): string | number;
    };
  }
  interface Morebits_Date_Instance_isValid {
    (): false | true;
  }
  interface Morebits_Date_Instance_isBefore {
    (date: Date | Morebits_Date_Instance): false | true;
  }
  interface Morebits_Date_Instance_isAfter {
    (date: Date | Morebits_Date_Instance): false | true;
  }
  interface Morebits_Date_Instance_getUTCMonthName {
    (): string;
  }
  interface Morebits_Date_Instance_getUTCMonthNameAbbrev {
    (): string;
  }
  interface Morebits_Date_Instance_getMonthName {
    (): string;
  }
  interface Morebits_Date_Instance_getMonthNameAbbrev {
    (): string;
  }
  interface Morebits_Date_Instance_getUTCDayName {
    (): string;
  }
  interface Morebits_Date_Instance_getUTCDayNameAbbrev {
    (): string;
  }
  interface Morebits_Date_Instance_getDayName {
    (): string;
  }
  interface Morebits_Date_Instance_getDayNameAbbrev {
    (): string;
  }
  interface Morebits_Date_Instance_add {
    /**
     * Add a given number of minutes, hours, days, weeks, months, or years to the date.
     * This is done in-place. The modified date object is also returned, allowing chaining.
     *
     * @param number - Should be an integer.
     * @throws {Error} If invalid or unsupported unit is given.
     */
    (number: number, unit: string): Morebits_Date_Instance;
  }
  interface Morebits_Date_Instance_subtract {
    /**
     * Subtracts a given number of minutes, hours, days, weeks, months, or years to the date.
     * This is done in-place. The modified date object is also returned, allowing chaining.
     *
     * @param number - Should be an integer.
     * @throws {Error} If invalid or unsupported unit is given.
     */
    (number: number, unit: string): Morebits_Date_Instance;
  }
  interface Morebits_Date_Instance_format {
    /**
     * Format the date into a string per the given format string.
     * Replacement syntax is a subset of that in moment.js:
     *
     * | Syntax | Output |
     * |--------|--------|
     * | H | Hours (24-hour) |
     * | HH | Hours (24-hour, padded to 2 digits) |
     * | h | Hours (12-hour) |
     * | hh | Hours (12-hour, padded to 2 digits) |
     * | A | AM or PM |
     * | m | Minutes |
     * | mm | Minutes (padded to 2 digits) |
     * | s | Seconds |
     * | ss | Seconds (padded to 2 digits) |
     * | SSS | Milliseconds fragment, 3 digits |
     * | d | Day number of the week (Sun=0) |
     * | ddd | Abbreviated day name |
     * | dddd | Full day name |
     * | D | Date |
     * | DD | Date (padded to 2 digits) |
     * | M | Month number (1-indexed) |
     * | MM | Month number (1-indexed, padded to 2 digits) |
     * | MMM | Abbreviated month name |
     * | MMMM | Full month name |
     * | Y | Year |
     * | YY | Final two digits of year (20 for 2020, 42 for 1942) |
     * | YYYY | Year (same as `Y`) |
     *
     * @param formatstr - Format the date into a string, using
     * the replacement syntax.  Use `[` and `]` to escape items.  If not
     * provided, will return the ISO-8601-formatted string.
     * @param zone - `system` (for browser-default time zone),
     * `utc`, or specify a time zone as number of minutes relative to UTC.
     */
    (formatstr: string, zone: string | number): string;
  }
  interface Morebits_Date_Instance_calendar {
    /**
     * Gives a readable relative time string such as "Yesterday at 6:43 PM" or "Last Thursday at 11:45 AM".
     * Similar to `calendar` in moment.js, but with time zone support.
     *
     * @param zone - 'system' (for browser-default time zone),
     * 'utc' (for UTC), or specify a time zone as number of minutes past UTC.
     */
    (zone: string | number): string;
  }
  interface Morebits_Date_Instance_monthHeaderRegex {
    /**
     * Get a regular expression that matches wikitext section titles, such
     * as `==December 2019==` or `=== Jan 2018 ===`.
     */
    (): RegExp;
  }
  interface Morebits_Date_Instance_monthHeader {
    /**
     * Creates a wikitext section header with the month and year.
     *
     * @param level - Header level.  Pass 0 for just the text
     * with no wikitext markers (==).
     */
    (level: number): string;
  }
  interface Morebits_wiki {
    numberOfActionsLeft: number;
    nbrOfCheckpointsLeft: number;
    /**
     * Display message and/or redirect to page upon completion of tasks.
     *
     * Every call to Morebits.wiki.Api.post() results in the dispatch of an
     * asynchronous callback. Each callback can in turn make an additional call to
     * Morebits.wiki.Api.post() to continue a processing sequence. At the
     * conclusion of the final callback of a processing sequence, it is not
     * possible to simply return to the original caller because there is no call
     * stack leading back to the original context. Instead,
     * Morebits.wiki.actionCompleted.event() is called to display the result to
     * the user and to perform an optional page redirect.
     *
     * The determination of when to call Morebits.wiki.actionCompleted.event() is
     * managed through the globals Morebits.wiki.numberOfActionsLeft and
     * Morebits.wiki.nbrOfCheckpointsLeft. Morebits.wiki.numberOfActionsLeft is
     * incremented at the start of every Morebits.wiki.Api call and decremented
     * after the completion of a callback function. If a callback function does
     * not create a new Morebits.wiki.Api object before exiting, it is the final
     * step in the processing chain and Morebits.wiki.actionCompleted.event() will
     * then be called.
     *
     * Optionally, callers may use Morebits.wiki.addCheckpoint() to indicate that
     * processing is not complete upon the conclusion of the final callback
     * function.  This is used for batch operations. The end of a batch is
     * signaled by calling Morebits.wiki.removeCheckpoint().
     */
    actionCompleted: Morebits_wiki_actionCompleted;
    addCheckpoint: Morebits_wiki_addCheckpoint;
    removeCheckpoint: Morebits_wiki_removeCheckpoint;
    /**
     * An easy way to talk to the MediaWiki API.  Accepts either json or xml
     * (default) formats; if json is selected, will default to `formatversion=2`
     * unless otherwise specified.  Similarly, enforces newer `errorformat`s,
     * defaulting to `html` if unspecified.  `uselang` enforced to the wiki's
     * content language.
     *
     * In new code, the use of the last 3 parameters should be avoided, instead
     * use {@link Morebits.wiki.Api#setStatusElement setStatusElement()} to bind
     * the status element (if needed) and use `.then()` or `.catch()` on the
     * promise returned by `post()`, rather than specify the `onSuccess` or
     * `onFailure` callbacks.
     *
     * @param currentAction - The current action (required).
     * @param query - The query (required).
     * @param onSuccess - The function to call when request is successful.
     * @param statusElement - A Morebits.Status object to use for status messages.
     * @param onError - The function to call if an error occurs.
     */
    Api: Morebits_wiki_Api;
    /**
     * Retrieves wikitext from a page. Caching is enabled with a duration of 1 day.
     *
     * @param title - Page title
     * @return Returns page content, or null if the page doesn't exist.
     */
    getCachedPage: Morebits_wiki_getCachedPage;
    /**
     * Retrieves JSON from a page. Caching is enabled with a duration of 1 day.
     *
     * @param title - Page title
     */
    getCachedJson: Morebits_wiki_getCachedJson;
    /**
     * Use the MediaWiki API to load a page and optionally edit it, move it, etc.
     *
     * Callers are not permitted to directly access the properties of this class!
     * All property access is through the appropriate get___() or set___() method.
     *
     * Callers should set {@link Morebits.wiki.actionCompleted.notice} and {@link Morebits.wiki.actionCompleted.redirect}
     * before the first call to {@link Morebits.wiki.Page.load()}.
     *
     * Each of the callback functions takes one parameter, which is a
     * reference to the Morebits.wiki.Page object that registered the callback.
     * Callback functions may invoke any Morebits.wiki.Page prototype method using this reference.
     *
     *
     * Call sequence for common operations (optional final user callbacks not shown):
     *
     * - Edit current contents of a page (no edit conflict):
     * `.load(userTextEditCallback) -> ctx.loadApi.post() ->
     * ctx.loadApi.post.success() -> ctx.fnLoadSuccess() -> userTextEditCallback() ->
     * .save() -> ctx.saveApi.post() -> ctx.loadApi.post.success() -> ctx.fnSaveSuccess()`
     *
     * - Edit current contents of a page (with edit conflict):
     * `.load(userTextEditCallback) -> ctx.loadApi.post() ->
     * ctx.loadApi.post.success() -> ctx.fnLoadSuccess() -> userTextEditCallback() ->
     * .save() -> ctx.saveApi.post() -> ctx.loadApi.post.success() ->
     * ctx.fnSaveError() -> ctx.loadApi.post() -> ctx.loadApi.post.success() ->
     * ctx.fnLoadSuccess() -> userTextEditCallback() -> .save() ->
     * ctx.saveApi.post() -> ctx.loadApi.post.success() -> ctx.fnSaveSuccess()`
     *
     * - Append to a page (similar for prepend and newSection):
     * `.append() -> ctx.loadApi.post() -> ctx.loadApi.post.success() ->
     * ctx.fnLoadSuccess() -> ctx.fnAutoSave() -> .save() -> ctx.saveApi.post() ->
     * ctx.loadApi.post.success() -> ctx.fnSaveSuccess()`
     *
     * Notes:
     * 1. All functions following Morebits.wiki.Api.post() are invoked asynchronously from the jQuery AJAX library.
     * 2. The sequence for append/prepend/newSection could be slightly shortened,
     * but it would require significant duplication of code for little benefit.
     *
     * @param pageName - The name of the page, prefixed by the namespace (if any).
     * For the current page, use `mw.config.get('wgPageName')`.
     * @param status - A string describing the action about to be undertaken,
     * or a Morebits.Status object
     */
    Page: Morebits_wiki_Page;
    /**
     * Use the API to parse a fragment of wikitext and render it as HTML.
     *
     * The suggested implementation pattern (in {@link Morebits.SimpleWindow} and
     * {@link Morebits.QuickForm} situations) is to construct a
     * `Morebits.wiki.Preview` object after rendering a `Morebits.QuickForm`, and
     * bind the object to an arbitrary property of the form (e.g. |previewer|).
     * For an example, see twinklewarn.js.
     *
     * @param previewbox - The element that will contain the rendered HTML,
     * usually a <div> element.
     */
    Preview: Morebits_wiki_Preview;
    api: Morebits_wiki_Api;
    page: Morebits_wiki_Page;
    preview: Morebits_wiki_Preview;
  }
  interface Morebits_wiki_actionCompleted {
    /**
     * Display message and/or redirect to page upon completion of tasks.
     *
     * Every call to Morebits.wiki.Api.post() results in the dispatch of an
     * asynchronous callback. Each callback can in turn make an additional call to
     * Morebits.wiki.Api.post() to continue a processing sequence. At the
     * conclusion of the final callback of a processing sequence, it is not
     * possible to simply return to the original caller because there is no call
     * stack leading back to the original context. Instead,
     * Morebits.wiki.actionCompleted.event() is called to display the result to
     * the user and to perform an optional page redirect.
     *
     * The determination of when to call Morebits.wiki.actionCompleted.event() is
     * managed through the globals Morebits.wiki.numberOfActionsLeft and
     * Morebits.wiki.nbrOfCheckpointsLeft. Morebits.wiki.numberOfActionsLeft is
     * incremented at the start of every Morebits.wiki.Api call and decremented
     * after the completion of a callback function. If a callback function does
     * not create a new Morebits.wiki.Api object before exiting, it is the final
     * step in the processing chain and Morebits.wiki.actionCompleted.event() will
     * then be called.
     *
     * Optionally, callers may use Morebits.wiki.addCheckpoint() to indicate that
     * processing is not complete upon the conclusion of the final callback
     * function.  This is used for batch operations. The end of a batch is
     * signaled by calling Morebits.wiki.removeCheckpoint().
     */
    (self: any): void;
    event: Morebits_wiki_actionCompleted_event;
    timeOut: any;
    redirect: any;
    notice: any;
  }
  interface Morebits_wiki_actionCompleted_event {
    (): void;
  }
  interface Morebits_wiki_addCheckpoint {
    (): void;
  }
  interface Morebits_wiki_removeCheckpoint {
    (): void;
  }
  interface Morebits_wiki_Api {
    /**
     * An easy way to talk to the MediaWiki API.  Accepts either json or xml
     * (default) formats; if json is selected, will default to `formatversion=2`
     * unless otherwise specified.  Similarly, enforces newer `errorformat`s,
     * defaulting to `html` if unspecified.  `uselang` enforced to the wiki's
     * content language.
     *
     * In new code, the use of the last 3 parameters should be avoided, instead
     * use {@link Morebits.wiki.Api#setStatusElement setStatusElement()} to bind
     * the status element (if needed) and use `.then()` or `.catch()` on the
     * promise returned by `post()`, rather than specify the `onSuccess` or
     * `onFailure` callbacks.
     *
     * @param currentAction - The current action (required).
     * @param query - The query (required).
     * @param onSuccess - The function to call when request is successful.
     * @param statusElement - A Morebits.Status object to use for status messages.
     * @param onError - The function to call if an error occurs.
     */
    new (
      currentAction: string,
      query: any,
      onSuccess: Function,
      statusElement: Morebits_wiki_Api_statusElement,
      onError: Function,
    ): Morebits_wiki_Api_Instance;
    /**
     * An easy way to talk to the MediaWiki API.  Accepts either json or xml
     * (default) formats; if json is selected, will default to `formatversion=2`
     * unless otherwise specified.  Similarly, enforces newer `errorformat`s,
     * defaulting to `html` if unspecified.  `uselang` enforced to the wiki's
     * content language.
     *
     * In new code, the use of the last 3 parameters should be avoided, instead
     * use {@link Morebits.wiki.Api#setStatusElement setStatusElement()} to bind
     * the status element (if needed) and use `.then()` or `.catch()` on the
     * promise returned by `post()`, rather than specify the `onSuccess` or
     * `onFailure` callbacks.
     *
     * @param currentAction - The current action (required).
     * @param query - The query (required).
     * @param onSuccess - The function to call when request is successful.
     * @param statusElement - A Morebits.Status object to use for status messages.
     * @param onError - The function to call if an error occurs.
     */
    (
      currentAction: string,
      query: any,
      onSuccess: Function,
      statusElement: Morebits_wiki_Api_statusElement,
      onError: Function,
    ): void;
    /**
     * Set the custom user agent header, which is used for server-side logging.
     * Note that doing so will set the useragent for every `Morebits.wiki.Api`
     * process performed thereafter.
     *
     * @see {@link https://lists.wikimedia.org/pipermail/mediawiki-api-announce/2014-November/000075.html}for original announcement.
     * @param ua :WT:TW]])] - User agent.  The default
     * value of `morebits.js ([[w:WT:TW]])` will be appended to any provided
     * value.
     */
    setApiUserAgent: Morebits_wiki_Api_setApiUserAgent;
    /**
     * Get a new CSRF token on encountering token errors.
     *
     * @return MediaWiki CSRF token.
     */
    getToken: Morebits_wiki_Api_getToken;
    prototype: Morebits_wiki_Api_Instance;
  }
  interface Morebits_wiki_Api_statusElement {
    textRaw: null;
    text: null;
    type: string;
    stat: null;
    statRaw: null;
    target: null;
    node: null;
    linked: false | true;
    /**
     * Add the status element node to the DOM.
     */
    link: Morebits_wiki_Api_statusElement_link;
    /**
     * Remove the status element node from the DOM.
     */
    unlink: Morebits_wiki_Api_statusElement_unlink;
    /**
     * Update the status.
     *
     * @param status - Part of status message after colon.
     * @param type - 'status' (blue), 'info' (green), 'warn'
     * (red), or 'error' (bold red).
     */
    update: Morebits_wiki_Api_statusElement_update;
    /**
     * Produce the html for first part of the status message.
     */
    generate: Morebits_wiki_Api_statusElement_generate;
    /**
     * Complete the html, for the second part of the status message.
     */
    render: Morebits_wiki_Api_statusElement_render;
    status: Morebits_wiki_Api_statusElement_status;
    info: Morebits_wiki_Api_statusElement_info;
    warn: Morebits_wiki_Api_statusElement_warn;
    error: Morebits_wiki_Api_statusElement_error;
  }
  interface Morebits_wiki_Api_statusElement_link {
    new (): Morebits_wiki_Api_statusElement_link_Instance;
    /**
     * Add the status element node to the DOM.
     */
    (): void;
    prototype: Morebits_wiki_Api_statusElement_link_Instance;
  }
  interface Morebits_wiki_Api_statusElement_link_Instance {
    linked: false | true;
  }
  interface Morebits_wiki_Api_statusElement_unlink {
    new (): Morebits_wiki_Api_statusElement_unlink_Instance;
    /**
     * Remove the status element node from the DOM.
     */
    (): void;
    prototype: Morebits_wiki_Api_statusElement_unlink_Instance;
  }
  interface Morebits_wiki_Api_statusElement_unlink_Instance {
    linked: false | true;
  }
  interface Morebits_wiki_Api_statusElement_update {
    new (): Morebits_wiki_Api_statusElement_update_Instance;
    /**
     * Update the status.
     *
     * @param status - Part of status message after colon.
     * @param type - 'status' (blue), 'info' (green), 'warn'
     * (red), or 'error' (bold red).
     */
    (status: string, type: string): void;
    prototype: Morebits_wiki_Api_statusElement_update_Instance;
  }
  interface Morebits_wiki_Api_statusElement_update_Instance {
    statRaw: string;
    stat: DocumentFragment;
    type: string;
  }
  interface Morebits_wiki_Api_statusElement_generate {
    new (): Morebits_wiki_Api_statusElement_generate_Instance;
    /**
     * Produce the html for first part of the status message.
     */
    (): void;
    prototype: Morebits_wiki_Api_statusElement_generate_Instance;
  }
  interface Morebits_wiki_Api_statusElement_generate_Instance {
    node: HTMLDivElement;
    target: any;
  }
  interface Morebits_wiki_Api_statusElement_render {
    /**
     * Complete the html, for the second part of the status message.
     */
    (): void;
  }
  interface Morebits_wiki_Api_statusElement_status {
    (status: any): void;
  }
  interface Morebits_wiki_Api_statusElement_info {
    (status: any): void;
  }
  interface Morebits_wiki_Api_statusElement_warn {
    (status: any): void;
  }
  interface Morebits_wiki_Api_statusElement_error {
    (status: any): void;
  }
  interface Morebits_wiki_Api_Instance {
    currentAction: string;
    query: null;
    onSuccess: null;
    onError: null;
    statelem: null;
    parent: Window & typeof globalThis;
    response: null;
    responseXML: null;
    statusText: null;
    errorCode: null;
    errorText: null;
    badtokenRetry: false | true;
    /**
     * Keep track of parent object for callbacks.
     */
    setParent: Morebits_wiki_Api_Instance_setParent;
    setStatusElement: Morebits_wiki_Api_Instance_setStatusElement;
    /**
     * Carry out the request.
     *
     * @param callerAjaxParameters - Do not specify a parameter unless you really
     * really want to give jQuery some extra parameters.
     * @return - A jQuery promise object that is resolved or rejected with the api object.
     */
    post: Morebits_wiki_Api_Instance_post;
    returnError: Morebits_wiki_Api_Instance_returnError;
    getStatusElement: Morebits_wiki_Api_Instance_getStatusElement;
    getErrorCode: Morebits_wiki_Api_Instance_getErrorCode;
    getErrorText: Morebits_wiki_Api_Instance_getErrorText;
    getXML: Morebits_wiki_Api_Instance_getXML;
    getResponse: Morebits_wiki_Api_Instance_getResponse;
  }
  interface Morebits_wiki_Api_Instance_setParent {
    new (): Morebits_wiki_Api_Instance_setParent_Instance;
    /**
     * Keep track of parent object for callbacks.
     */
    (parent: any): void;
    prototype: Morebits_wiki_Api_Instance_setParent_Instance;
  }
  interface Morebits_wiki_Api_Instance_setParent_Instance {
    parent: any;
  }
  interface Morebits_wiki_Api_Instance_setStatusElement {
    new (): Morebits_wiki_Api_Instance_setStatusElement_Instance;
    (statusElement: Morebits_wiki_Api_statusElement): void;
    prototype: Morebits_wiki_Api_Instance_setStatusElement_Instance;
  }
  interface Morebits_wiki_Api_Instance_setStatusElement_Instance {
    statelem: Morebits_wiki_Api_statusElement;
  }
  interface Morebits_wiki_Api_Instance_post {
    /**
     * Carry out the request.
     *
     * @param callerAjaxParameters - Do not specify a parameter unless you really
     * really want to give jQuery some extra parameters.
     * @return - A jQuery promise object that is resolved or rejected with the api object.
     */
    (callerAjaxParameters: any): JQuery.Promise;
  }
  interface Morebits_wiki_Api_Instance_returnError {
    new (): Morebits_wiki_Api_Instance_returnError_Instance;
    (callerAjaxParameters: any): any;
    prototype: Morebits_wiki_Api_Instance_returnError_Instance;
  }
  interface Morebits_wiki_Api_Instance_returnError_Instance {
    badtokenRetry: false | true;
  }
  interface Morebits_wiki_Api_Instance_getStatusElement {
    (): any;
  }
  interface Morebits_wiki_Api_Instance_getErrorCode {
    (): any;
  }
  interface Morebits_wiki_Api_Instance_getErrorText {
    (): any;
  }
  interface Morebits_wiki_Api_Instance_getXML {
    (): any;
  }
  interface Morebits_wiki_Api_Instance_getResponse {
    (): any;
  }
  interface Morebits_wiki_Api_setApiUserAgent {
    /**
     * Set the custom user agent header, which is used for server-side logging.
     * Note that doing so will set the useragent for every `Morebits.wiki.Api`
     * process performed thereafter.
     *
     * @see {@link https://lists.wikimedia.org/pipermail/mediawiki-api-announce/2014-November/000075.html}for original announcement.
     * @param ua :WT:TW]])] - User agent.  The default
     * value of `morebits.js ([[w:WT:TW]])` will be appended to any provided
     * value.
     */
    (ua: string): void;
  }
  interface Morebits_wiki_Api_getToken {
    /**
     * Get a new CSRF token on encountering token errors.
     *
     * @return MediaWiki CSRF token.
     */
    (): string;
  }
  interface Morebits_wiki_getCachedPage {
    /**
     * Retrieves wikitext from a page. Caching is enabled with a duration of 1 day.
     *
     * @param title - Page title
     * @return Returns page content, or null if the page doesn't exist.
     */
    (title: string): Promise<string>;
  }
  interface Morebits_wiki_getCachedJson {
    /**
     * Retrieves JSON from a page. Caching is enabled with a duration of 1 day.
     *
     * @param title - Page title
     */
    (title: string): Promise<string>;
  }
  interface Morebits_wiki_Page {
    /**
     * Use the MediaWiki API to load a page and optionally edit it, move it, etc.
     *
     * Callers are not permitted to directly access the properties of this class!
     * All property access is through the appropriate get___() or set___() method.
     *
     * Callers should set {@link Morebits.wiki.actionCompleted.notice} and {@link Morebits.wiki.actionCompleted.redirect}
     * before the first call to {@link Morebits.wiki.Page.load()}.
     *
     * Each of the callback functions takes one parameter, which is a
     * reference to the Morebits.wiki.Page object that registered the callback.
     * Callback functions may invoke any Morebits.wiki.Page prototype method using this reference.
     *
     *
     * Call sequence for common operations (optional final user callbacks not shown):
     *
     * - Edit current contents of a page (no edit conflict):
     * `.load(userTextEditCallback) -> ctx.loadApi.post() ->
     * ctx.loadApi.post.success() -> ctx.fnLoadSuccess() -> userTextEditCallback() ->
     * .save() -> ctx.saveApi.post() -> ctx.loadApi.post.success() -> ctx.fnSaveSuccess()`
     *
     * - Edit current contents of a page (with edit conflict):
     * `.load(userTextEditCallback) -> ctx.loadApi.post() ->
     * ctx.loadApi.post.success() -> ctx.fnLoadSuccess() -> userTextEditCallback() ->
     * .save() -> ctx.saveApi.post() -> ctx.loadApi.post.success() ->
     * ctx.fnSaveError() -> ctx.loadApi.post() -> ctx.loadApi.post.success() ->
     * ctx.fnLoadSuccess() -> userTextEditCallback() -> .save() ->
     * ctx.saveApi.post() -> ctx.loadApi.post.success() -> ctx.fnSaveSuccess()`
     *
     * - Append to a page (similar for prepend and newSection):
     * `.append() -> ctx.loadApi.post() -> ctx.loadApi.post.success() ->
     * ctx.fnLoadSuccess() -> ctx.fnAutoSave() -> .save() -> ctx.saveApi.post() ->
     * ctx.loadApi.post.success() -> ctx.fnSaveSuccess()`
     *
     * Notes:
     * 1. All functions following Morebits.wiki.Api.post() are invoked asynchronously from the jQuery AJAX library.
     * 2. The sequence for append/prepend/newSection could be slightly shortened,
     * but it would require significant duplication of code for little benefit.
     *
     * @param pageName - The name of the page, prefixed by the namespace (if any).
     * For the current page, use `mw.config.get('wgPageName')`.
     * @param status - A string describing the action about to be undertaken,
     * or a Morebits.Status object
     */
    new (
      pageName: string,
      status: string | Morebits_wiki_Api_statusElement,
    ): Morebits_wiki_Page_Instance;
    /**
     * Use the MediaWiki API to load a page and optionally edit it, move it, etc.
     *
     * Callers are not permitted to directly access the properties of this class!
     * All property access is through the appropriate get___() or set___() method.
     *
     * Callers should set {@link Morebits.wiki.actionCompleted.notice} and {@link Morebits.wiki.actionCompleted.redirect}
     * before the first call to {@link Morebits.wiki.Page.load()}.
     *
     * Each of the callback functions takes one parameter, which is a
     * reference to the Morebits.wiki.Page object that registered the callback.
     * Callback functions may invoke any Morebits.wiki.Page prototype method using this reference.
     *
     *
     * Call sequence for common operations (optional final user callbacks not shown):
     *
     * - Edit current contents of a page (no edit conflict):
     * `.load(userTextEditCallback) -> ctx.loadApi.post() ->
     * ctx.loadApi.post.success() -> ctx.fnLoadSuccess() -> userTextEditCallback() ->
     * .save() -> ctx.saveApi.post() -> ctx.loadApi.post.success() -> ctx.fnSaveSuccess()`
     *
     * - Edit current contents of a page (with edit conflict):
     * `.load(userTextEditCallback) -> ctx.loadApi.post() ->
     * ctx.loadApi.post.success() -> ctx.fnLoadSuccess() -> userTextEditCallback() ->
     * .save() -> ctx.saveApi.post() -> ctx.loadApi.post.success() ->
     * ctx.fnSaveError() -> ctx.loadApi.post() -> ctx.loadApi.post.success() ->
     * ctx.fnLoadSuccess() -> userTextEditCallback() -> .save() ->
     * ctx.saveApi.post() -> ctx.loadApi.post.success() -> ctx.fnSaveSuccess()`
     *
     * - Append to a page (similar for prepend and newSection):
     * `.append() -> ctx.loadApi.post() -> ctx.loadApi.post.success() ->
     * ctx.fnLoadSuccess() -> ctx.fnAutoSave() -> .save() -> ctx.saveApi.post() ->
     * ctx.loadApi.post.success() -> ctx.fnSaveSuccess()`
     *
     * Notes:
     * 1. All functions following Morebits.wiki.Api.post() are invoked asynchronously from the jQuery AJAX library.
     * 2. The sequence for append/prepend/newSection could be slightly shortened,
     * but it would require significant duplication of code for little benefit.
     *
     * @param pageName - The name of the page, prefixed by the namespace (if any).
     * For the current page, use `mw.config.get('wgPageName')`.
     * @param status - A string describing the action about to be undertaken,
     * or a Morebits.Status object
     */
    (pageName: string, status: string | Morebits_wiki_Api_statusElement): void;
    prototype: Morebits_wiki_Page_Instance;
  }
  interface Morebits_wiki_Page_Instance {
    /**
     * Loads the text for the page.
     *
     * @param onSuccess - Callback function which is called when the load has succeeded.
     * @param onFailure - Callback function which is called when the load fails.
     */
    load: Morebits_wiki_Page_Instance_load;
    /**
     * Saves the text for the page to Wikipedia.
     * Must be preceded by successfully calling `load()`.
     *
     * Warning: Calling `save()` can result in additional calls to the
     * previous `load()` callbacks to recover from edit conflicts! In this
     * case, callers must make the same edit to the new pageText and
     * re-invoke `save()`.  This behavior can be disabled with
     * `setMaxConflictRetries(0)`.
     *
     * @param onSuccess - Callback function which is called when the save has succeeded.
     * @param onFailure - Callback function which is called when the save fails.
     */
    save: Morebits_wiki_Page_Instance_save;
    /**
     * Adds the text provided via `setAppendText()` to the end of the
     * page.  Does not require calling `load()` first, unless a watchlist
     * expiry is used.
     *
     * @param onSuccess - Callback function which is called when the method has succeeded.
     * @param onFailure - Callback function which is called when the method fails.
     */
    append: Morebits_wiki_Page_Instance_append;
    /**
     * Adds the text provided via `setPrependText()` to the start of the
     * page.  Does not require calling `load()` first, unless a watchlist
     * expiry is used.
     *
     * @param onSuccess - Callback function which is called when the method has succeeded.
     * @param onFailure - Callback function which is called when the method fails.
     */
    prepend: Morebits_wiki_Page_Instance_prepend;
    /**
     * Creates a new section with the text provided by `setNewSectionText()`
     * and section title from `setNewSectionTitle()`.
     * If `editSummary` is provided, that will be used instead of the
     * autogenerated "->Title (new section" edit summary.
     * Does not require calling `load()` first, unless a watchlist expiry
     * is used.
     *
     * @param onSuccess - Callback function which is called when the method has succeeded.
     * @param onFailure - Callback function which is called when the method fails.
     */
    newSection: Morebits_wiki_Page_Instance_newSection;
    /**
     * @return The name of the loaded page, including the namespace
     */
    getPageName: Morebits_wiki_Page_Instance_getPageName;
    /**
     * @return The text of the page after a successful load()
     */
    getPageText: Morebits_wiki_Page_Instance_getPageText;
    /**
     * @param pageText - Updated page text that will be saved when `save()` is called
     */
    setPageText: Morebits_wiki_Page_Instance_setPageText;
    /**
     * @param appendText - Text that will be appended to the page when `append()` is called
     */
    setAppendText: Morebits_wiki_Page_Instance_setAppendText;
    /**
     * @param prependText - Text that will be prepended to the page when `prepend()` is called
     */
    setPrependText: Morebits_wiki_Page_Instance_setPrependText;
    /**
     * @param newSectionText - Text that will be added in a new section on the page when `newSection()` is called
     */
    setNewSectionText: Morebits_wiki_Page_Instance_setNewSectionText;
    /**
     * @param newSectionTitle - Title for the new section created when `newSection()` is called
     * If missing, `ctx.editSummary` will be used. Issues may occur if a substituted template is used.
     */
    setNewSectionTitle: Morebits_wiki_Page_Instance_setNewSectionTitle;
    /**
     * Set the edit summary that will be used when `save()` is called.
     * Unnecessary if editMode is 'new' and newSectionTitle is provided.
     */
    setEditSummary: Morebits_wiki_Page_Instance_setEditSummary;
    /**
     * Set any custom tag(s) to be applied to the API action.
     * A number of actions don't support it, most notably watch, review,
     * and stabilize ({@link https://phabricator.wikimedia.org/T247721 T247721}).
     *
     * @param tags - String or array of tag(s).
     */
    setChangeTags: Morebits_wiki_Page_Instance_setChangeTags;
    /**
     * @param createOption - Can take the following four values:
     * - recreate: create the page if it does not exist, or edit it if it exists.
     * - createonly: create the page if it does not exist, but return an
     * error if it already exists.
     * - nocreate: don't create the page, only edit it if it already exists.
     * - `null`: create the page if it does not exist, unless it was deleted
     * in the moment between loading the page and saving the edit (default).
     */
    setCreateOption: Morebits_wiki_Page_Instance_setCreateOption;
    /**
     * @param minorEdit - Set true to mark the edit as a minor edit.
     */
    setMinorEdit: Morebits_wiki_Page_Instance_setMinorEdit;
    /**
     * @param botEdit - Set true to mark the edit as a bot edit
     */
    setBotEdit: Morebits_wiki_Page_Instance_setBotEdit;
    /**
     * @param pageSection - Integer specifying the section number to load or save.
     * If specified as `null`, the entire page will be retrieved.
     */
    setPageSection: Morebits_wiki_Page_Instance_setPageSection;
    /**
     * @param maxConflictRetries - Number of retries for save errors involving an edit conflict or
     * loss of token. Default: 2.
     */
    setMaxConflictRetries: Morebits_wiki_Page_Instance_setMaxConflictRetries;
    /**
     * @param maxRetries - Number of retries for save errors not involving an edit conflict or
     * loss of token. Default: 2.
     */
    setMaxRetries: Morebits_wiki_Page_Instance_setMaxRetries;
    /**
     * Set whether and how to watch the page, including setting an expiry.
     *
     * @param watchlistOption -
     * Basically a mix of MW API and Twinkley options available pre-expiry:
     * - `true`|`'yes'`|`'watch'`: page will be added to the user's
     * watchlist when the action is called. Defaults to an indefinite
     * watch unless `watchlistExpiry` is provided.
     * - `false`|`'no'`|`'nochange'`: watchlist status of the page (including expiry) will not be changed.
     * - `'default'`|`'preferences'`: watchlist status of the page will be
     * set based on the user's preference settings when the action is
     * called. Defaults to an indefinite watch unless `watchlistExpiry` is
     * provided.
     * - `'unwatch'`: explicitly unwatch the page.
     * - Any other `string` or `number`, or a `Morebits.Date` or `Date`
     * object: watch page until the specified time, deferring to
     * `watchlistExpiry` if provided.
     * @param watchlistExpiry -
     * A date-like string or number, or a date object.  If a string or number,
     * can be relative (2 weeks) or other similarly date-like (i.e. NOT "potato"):
     * ISO 8601: 2038-01-09T03:14:07Z
     * MediaWiki: 20380109031407
     * UNIX: 2147483647
     * SQL: 2038-01-09 03:14:07
     * Can also be `infinity` or infinity-like (`infinite`, `indefinite`, and `never`).
     * See {@link https://phabricator.wikimedia.org/source/mediawiki-libs-Timestamp/browse/master/src/ConvertibleTimestamp.php;4e53b859a9580c55958078f46dd4f3a44d0fcaa0$57-109?as=source&blame=off}
     */
    setWatchlist: Morebits_wiki_Page_Instance_setWatchlist;
    /**
     * Set a watchlist expiry. setWatchlist can mostly handle this by
     * itself, so this is here largely for completeness and compatibility
     * with the full suite of options.
     *
     * @param watchlistExpiry -
     * A date-like string or number, or a date object.  If a string or number,
     * can be relative (2 weeks) or other similarly date-like (i.e. NOT "potato"):
     * ISO 8601: 2038-01-09T03:14:07Z
     * MediaWiki: 20380109031407
     * UNIX: 2147483647
     * SQL: 2038-01-09 03:14:07
     * Can also be `infinity` or infinity-like (`infinite`, `indefinite`, and `never`).
     * See {@link https://phabricator.wikimedia.org/source/mediawiki-libs-Timestamp/browse/master/src/ConvertibleTimestamp.php;4e53b859a9580c55958078f46dd4f3a44d0fcaa0$57-109?as=source&blame=off}
     */
    setWatchlistExpiry: Morebits_wiki_Page_Instance_setWatchlistExpiry;
    /**
     * If editing a talk page, set whether to subscribe to any talk
     * page thread created by the edit.
     */
    setDiscussionToolsAutoSubscribe: Morebits_wiki_Page_Instance_setDiscussionToolsAutoSubscribe;
    /**
     * @param followRedirect -
     * - `true`: a maximum of one redirect will be followed. In the event
     * of a redirect, a message is displayed to the user and the redirect
     * target can be retrieved with getPageName().
     * - `false`: (default) the requested pageName will be used without regard to any redirect.
     * @param followCrossNsRedirect - Not applicable if `followRedirect` is not set true.
     * - `true`: (default) follow redirect even if it is a cross-namespace redirect
     * - `false`: don't follow redirect if it is cross-namespace, edit the redirect itself.
     */
    setFollowRedirect: Morebits_wiki_Page_Instance_setFollowRedirect;
    /**
     * @param flag - If set true, the author and timestamp of
     * the first non-redirect version of the page is retrieved.
     *
     * Warning:
     * 1. If there are no revisions among the first 50 that are
     * non-redirects, or if there are less 50 revisions and all are
     * redirects, the original creation is retrieved.
     * 2. Revisions that the user is not privileged to access
     * (revdeled/suppressed) will be treated as non-redirects.
     * 3. Must not be used when the page has a non-wikitext contentmodel
     * such as Modulespace Lua or user JavaScript/CSS.
     */
    setLookupNonRedirectCreator: Morebits_wiki_Page_Instance_setLookupNonRedirectCreator;
    setMoveDestination: Morebits_wiki_Page_Instance_setMoveDestination;
    setMoveTalkPage: Morebits_wiki_Page_Instance_setMoveTalkPage;
    setMoveSubpages: Morebits_wiki_Page_Instance_setMoveSubpages;
    setMoveSuppressRedirect: Morebits_wiki_Page_Instance_setMoveSuppressRedirect;
    /**
     * @param level - The right required for the specific action
     * e.g. autoconfirmed, sysop, templateeditor, extendedconfirmed
     * (enWiki-only).
     */
    setEditProtection: Morebits_wiki_Page_Instance_setEditProtection;
    setMoveProtection: Morebits_wiki_Page_Instance_setMoveProtection;
    setCreateProtection: Morebits_wiki_Page_Instance_setCreateProtection;
    setCascadingProtection: Morebits_wiki_Page_Instance_setCascadingProtection;
    suppressProtectWarning: Morebits_wiki_Page_Instance_suppressProtectWarning;
    setDeleteTalkPage: Morebits_wiki_Page_Instance_setDeleteTalkPage;
    setUndeleteTalkPage: Morebits_wiki_Page_Instance_setUndeleteTalkPage;
    setOldID: Morebits_wiki_Page_Instance_setOldID;
    /**
     * @return The current revision ID of the page
     */
    getCurrentID: Morebits_wiki_Page_Instance_getCurrentID;
    /**
     * @return Last editor of the page
     */
    getRevisionUser: Morebits_wiki_Page_Instance_getRevisionUser;
    /**
     * @return ISO 8601 timestamp at which the page was last edited.
     */
    getLastEditTime: Morebits_wiki_Page_Instance_getLastEditTime;
    /**
     * Define an object for use in a callback function.
     *
     * `callbackParameters` is for use by the caller only. The parameters
     * allow a caller to pass the proper context into its callback
     * function.  Callers must ensure that any changes to the
     * callbackParameters object within a `load()` callback still permit a
     * proper re-entry into the `load()` callback if an edit conflict is
     * detected upon calling `save()`.
     */
    setCallbackParameters: Morebits_wiki_Page_Instance_setCallbackParameters;
    /**
     * @return - The object previously set by `setCallbackParameters()`.
     */
    getCallbackParameters: Morebits_wiki_Page_Instance_getCallbackParameters;
    setStatusElement: Morebits_wiki_Page_Instance_setStatusElement;
    /**
     * @return Status element created by the constructor.
     */
    getStatusElement: Morebits_wiki_Page_Instance_getStatusElement;
    /**
     * @param level - The right required for edits not to require
     * review. Possible options: none, autoconfirmed, review (not on enWiki).
     */
    setFlaggedRevs: Morebits_wiki_Page_Instance_setFlaggedRevs;
    /**
     * @return True if the page existed on the wiki when it was last loaded.
     */
    exists: Morebits_wiki_Page_Instance_exists;
    /**
     * @return Page ID of the page loaded. 0 if the page doesn't
     * exist.
     */
    getPageID: Morebits_wiki_Page_Instance_getPageID;
    /**
     * @return - Content model of the page.  Possible values
     * include (but may not be limited to): `wikitext`, `javascript`,
     * `css`, `json`, `Scribunto`, `sanitized-css`, `MassMessageListContent`.
     * Also gettable via `mw.config.get('wgPageContentModel')`.
     */
    getContentModel: Morebits_wiki_Page_Instance_getContentModel;
    /**
     * @return - Watched status of the page. Boolean
     * unless it's being watched temporarily, in which case returns the
     * expiry string.
     */
    getWatched: Morebits_wiki_Page_Instance_getWatched;
    /**
     * @return ISO 8601 timestamp at which the page was last loaded.
     */
    getLoadTime: Morebits_wiki_Page_Instance_getLoadTime;
    /**
     * @return The user who created the page following `lookupCreation()`.
     */
    getCreator: Morebits_wiki_Page_Instance_getCreator;
    /**
     * @return The ISOString timestamp of page creation following `lookupCreation()`.
     */
    getCreationTimestamp: Morebits_wiki_Page_Instance_getCreationTimestamp;
    /**
     * @return whether or not you can edit the page
     */
    canEdit: Morebits_wiki_Page_Instance_canEdit;
    /**
     * Retrieves the username of the user who created the page as well as
     * the timestamp of creation.  The username can be retrieved using the
     * `getCreator()` function; the timestamp can be retrieved using the
     * `getCreationTimestamp()` function.
     * Prior to June 2019 known as `lookupCreator()`.
     *
     * @param onSuccess - Callback function to be called when
     * the username and timestamp are found within the callback.
     * @param onFailure - Callback function to be called when
     * the lookup fails
     */
    lookupCreation: Morebits_wiki_Page_Instance_lookupCreation;
    /**
     * Reverts a page to `revertOldID` set by `setOldID`.
     *
     * @param onSuccess - Callback function to run on success.
     * @param onFailure - Callback function to run on failure.
     */
    revert: Morebits_wiki_Page_Instance_revert;
    /**
     * Moves a page to another title.
     *
     * @param onSuccess - Callback function to run on success.
     * @param onFailure - Callback function to run on failure.
     */
    move: Morebits_wiki_Page_Instance_move;
    /**
     * Marks the page as patrolled, using `rcid` (if available) or `revid`.
     *
     * Patrolling as such doesn't need to rely on loading the page in
     * question; simply passing a revid to the API is sufficient, so in
     * those cases just using {@link Morebits.wiki.Api} is probably preferable.
     *
     * No error handling since we don't actually care about the errors.
     */
    patrol: Morebits_wiki_Page_Instance_patrol;
    /**
     * Marks the page as reviewed by the PageTriage extension.
     *
     * Will, by it's nature, mark as patrolled as well. Falls back to
     * patrolling if not in an appropriate namespace.
     *
     * Doesn't inherently rely on loading the page in question; simply
     * passing a `pageid` to the API is sufficient, so in those cases just
     * using {@link Morebits.wiki.Api} is probably preferable.
     *
     * Will first check if the page is queued via
     * {@link Morebits.wiki.Page~fnProcessTriageList|fnProcessTriageList}.
     *
     * No error handling since we don't actually care about the errors.
     *
     * @see {@link https://www.mediawiki.org/wiki/Extension:PageTriage} Referred to as "review" on-wiki.
     */
    triage: Morebits_wiki_Page_Instance_triage;
    /**
     * Deletes a page (for admins only).
     *
     * @param onSuccess - Callback function to run on success.
     * @param onFailure - Callback function to run on failure.
     */
    deletePage: Morebits_wiki_Page_Instance_deletePage;
    /**
     * Undeletes a page (for admins only).
     *
     * @param onSuccess - Callback function to run on success.
     * @param onFailure - Callback function to run on failure.
     */
    undeletePage: Morebits_wiki_Page_Instance_undeletePage;
    /**
     * Protects a page (for admins only).
     *
     * @param onSuccess - Callback function to run on success.
     * @param onFailure - Callback function to run on failure.
     */
    protect: Morebits_wiki_Page_Instance_protect;
    /**
     * Apply FlaggedRevs protection settings.  Only works on wikis where
     * the extension is installed (`$wgFlaggedRevsProtection = true`
     * i.e. where FlaggedRevs settings appear on the "protect" tab).
     *
     * @see {@link https://www.mediawiki.org/wiki/Extension:FlaggedRevs}Referred to as "pending changes" on-wiki.
     */
    stabilize: Morebits_wiki_Page_Instance_stabilize;
  }
  interface Morebits_wiki_Page_Instance_load {
    /**
     * Loads the text for the page.
     *
     * @param onSuccess - Callback function which is called when the load has succeeded.
     * @param onFailure - Callback function which is called when the load fails.
     */
    (onSuccess: Function, onFailure: Function): void;
  }
  interface Morebits_wiki_Page_Instance_save {
    /**
     * Saves the text for the page to Wikipedia.
     * Must be preceded by successfully calling `load()`.
     *
     * Warning: Calling `save()` can result in additional calls to the
     * previous `load()` callbacks to recover from edit conflicts! In this
     * case, callers must make the same edit to the new pageText and
     * re-invoke `save()`.  This behavior can be disabled with
     * `setMaxConflictRetries(0)`.
     *
     * @param onSuccess - Callback function which is called when the save has succeeded.
     * @param onFailure - Callback function which is called when the save fails.
     */
    (onSuccess: Function, onFailure: Function): void;
  }
  interface Morebits_wiki_Page_Instance_append {
    /**
     * Adds the text provided via `setAppendText()` to the end of the
     * page.  Does not require calling `load()` first, unless a watchlist
     * expiry is used.
     *
     * @param onSuccess - Callback function which is called when the method has succeeded.
     * @param onFailure - Callback function which is called when the method fails.
     */
    (onSuccess: Function, onFailure: Function): void;
  }
  interface Morebits_wiki_Page_Instance_prepend {
    /**
     * Adds the text provided via `setPrependText()` to the start of the
     * page.  Does not require calling `load()` first, unless a watchlist
     * expiry is used.
     *
     * @param onSuccess - Callback function which is called when the method has succeeded.
     * @param onFailure - Callback function which is called when the method fails.
     */
    (onSuccess: Function, onFailure: Function): void;
  }
  interface Morebits_wiki_Page_Instance_newSection {
    /**
     * Creates a new section with the text provided by `setNewSectionText()`
     * and section title from `setNewSectionTitle()`.
     * If `editSummary` is provided, that will be used instead of the
     * autogenerated "->Title (new section" edit summary.
     * Does not require calling `load()` first, unless a watchlist expiry
     * is used.
     *
     * @param onSuccess - Callback function which is called when the method has succeeded.
     * @param onFailure - Callback function which is called when the method fails.
     */
    (onSuccess: Function, onFailure: Function): void;
  }
  interface Morebits_wiki_Page_Instance_getPageName {
    /**
     * @return The name of the loaded page, including the namespace
     */
    (): string;
  }
  interface Morebits_wiki_Page_Instance_getPageText {
    /**
     * @return The text of the page after a successful load()
     */
    (): string;
  }
  interface Morebits_wiki_Page_Instance_setPageText {
    /**
     * @param pageText - Updated page text that will be saved when `save()` is called
     */
    (pageText: string): void;
  }
  interface Morebits_wiki_Page_Instance_setAppendText {
    /**
     * @param appendText - Text that will be appended to the page when `append()` is called
     */
    (appendText: string): void;
  }
  interface Morebits_wiki_Page_Instance_setPrependText {
    /**
     * @param prependText - Text that will be prepended to the page when `prepend()` is called
     */
    (prependText: string): void;
  }
  interface Morebits_wiki_Page_Instance_setNewSectionText {
    /**
     * @param newSectionText - Text that will be added in a new section on the page when `newSection()` is called
     */
    (newSectionText: string): void;
  }
  interface Morebits_wiki_Page_Instance_setNewSectionTitle {
    /**
     * @param newSectionTitle - Title for the new section created when `newSection()` is called
     * If missing, `ctx.editSummary` will be used. Issues may occur if a substituted template is used.
     */
    (newSectionTitle: string): void;
  }
  interface Morebits_wiki_Page_Instance_setEditSummary {
    /**
     * Set the edit summary that will be used when `save()` is called.
     * Unnecessary if editMode is 'new' and newSectionTitle is provided.
     */
    (summary: string): void;
  }
  interface Morebits_wiki_Page_Instance_setChangeTags {
    /**
     * Set any custom tag(s) to be applied to the API action.
     * A number of actions don't support it, most notably watch, review,
     * and stabilize ({@link https://phabricator.wikimedia.org/T247721 T247721}).
     *
     * @param tags - String or array of tag(s).
     */
    (tags: string | string[]): void;
  }
  interface Morebits_wiki_Page_Instance_setCreateOption {
    /**
     * @param createOption - Can take the following four values:
     * - recreate: create the page if it does not exist, or edit it if it exists.
     * - createonly: create the page if it does not exist, but return an
     * error if it already exists.
     * - nocreate: don't create the page, only edit it if it already exists.
     * - `null`: create the page if it does not exist, unless it was deleted
     * in the moment between loading the page and saving the edit (default).
     */
    (createOption: string): void;
  }
  interface Morebits_wiki_Page_Instance_setMinorEdit {
    /**
     * @param minorEdit - Set true to mark the edit as a minor edit.
     */
    (minorEdit: false | true): void;
  }
  interface Morebits_wiki_Page_Instance_setBotEdit {
    /**
     * @param botEdit - Set true to mark the edit as a bot edit
     */
    (botEdit: false | true): void;
  }
  interface Morebits_wiki_Page_Instance_setPageSection {
    /**
     * @param pageSection - Integer specifying the section number to load or save.
     * If specified as `null`, the entire page will be retrieved.
     */
    (pageSection: number): void;
  }
  interface Morebits_wiki_Page_Instance_setMaxConflictRetries {
    /**
     * @param maxConflictRetries - Number of retries for save errors involving an edit conflict or
     * loss of token. Default: 2.
     */
    (maxConflictRetries: number): void;
  }
  interface Morebits_wiki_Page_Instance_setMaxRetries {
    /**
     * @param maxRetries - Number of retries for save errors not involving an edit conflict or
     * loss of token. Default: 2.
     */
    (maxRetries: number): void;
  }
  interface Morebits_wiki_Page_Instance_setWatchlist {
    /**
     * Set whether and how to watch the page, including setting an expiry.
     *
     * @param watchlistOption -
     * Basically a mix of MW API and Twinkley options available pre-expiry:
     * - `true`|`'yes'`|`'watch'`: page will be added to the user's
     * watchlist when the action is called. Defaults to an indefinite
     * watch unless `watchlistExpiry` is provided.
     * - `false`|`'no'`|`'nochange'`: watchlist status of the page (including expiry) will not be changed.
     * - `'default'`|`'preferences'`: watchlist status of the page will be
     * set based on the user's preference settings when the action is
     * called. Defaults to an indefinite watch unless `watchlistExpiry` is
     * provided.
     * - `'unwatch'`: explicitly unwatch the page.
     * - Any other `string` or `number`, or a `Morebits.Date` or `Date`
     * object: watch page until the specified time, deferring to
     * `watchlistExpiry` if provided.
     * @param watchlistExpiry -
     * A date-like string or number, or a date object.  If a string or number,
     * can be relative (2 weeks) or other similarly date-like (i.e. NOT "potato"):
     * ISO 8601: 2038-01-09T03:14:07Z
     * MediaWiki: 20380109031407
     * UNIX: 2147483647
     * SQL: 2038-01-09 03:14:07
     * Can also be `infinity` or infinity-like (`infinite`, `indefinite`, and `never`).
     * See {@link https://phabricator.wikimedia.org/source/mediawiki-libs-Timestamp/browse/master/src/ConvertibleTimestamp.php;4e53b859a9580c55958078f46dd4f3a44d0fcaa0$57-109?as=source&blame=off}
     */
    (
      watchlistOption: string | false | true | Date | Morebits_Date_Instance,
      watchlistExpiry: string | number | Date | Morebits_Date_Instance,
    ): void;
  }
  interface Morebits_wiki_Page_Instance_setWatchlistExpiry {
    /**
     * Set a watchlist expiry. setWatchlist can mostly handle this by
     * itself, so this is here largely for completeness and compatibility
     * with the full suite of options.
     *
     * @param watchlistExpiry -
     * A date-like string or number, or a date object.  If a string or number,
     * can be relative (2 weeks) or other similarly date-like (i.e. NOT "potato"):
     * ISO 8601: 2038-01-09T03:14:07Z
     * MediaWiki: 20380109031407
     * UNIX: 2147483647
     * SQL: 2038-01-09 03:14:07
     * Can also be `infinity` or infinity-like (`infinite`, `indefinite`, and `never`).
     * See {@link https://phabricator.wikimedia.org/source/mediawiki-libs-Timestamp/browse/master/src/ConvertibleTimestamp.php;4e53b859a9580c55958078f46dd4f3a44d0fcaa0$57-109?as=source&blame=off}
     */
    (watchlistExpiry: string | number | Date | Morebits_Date_Instance): void;
  }
  interface Morebits_wiki_Page_Instance_setDiscussionToolsAutoSubscribe {
    /**
     * If editing a talk page, set whether to subscribe to any talk
     * page thread created by the edit.
     */
    (subscribe: false | true): void;
  }
  interface Morebits_wiki_Page_Instance_setFollowRedirect {
    /**
     * @param followRedirect -
     * - `true`: a maximum of one redirect will be followed. In the event
     * of a redirect, a message is displayed to the user and the redirect
     * target can be retrieved with getPageName().
     * - `false`: (default) the requested pageName will be used without regard to any redirect.
     * @param followCrossNsRedirect - Not applicable if `followRedirect` is not set true.
     * - `true`: (default) follow redirect even if it is a cross-namespace redirect
     * - `false`: don't follow redirect if it is cross-namespace, edit the redirect itself.
     */
    (followRedirect: false | true, followCrossNsRedirect: false | true): void;
  }
  interface Morebits_wiki_Page_Instance_setLookupNonRedirectCreator {
    /**
     * @param flag - If set true, the author and timestamp of
     * the first non-redirect version of the page is retrieved.
     *
     * Warning:
     * 1. If there are no revisions among the first 50 that are
     * non-redirects, or if there are less 50 revisions and all are
     * redirects, the original creation is retrieved.
     * 2. Revisions that the user is not privileged to access
     * (revdeled/suppressed) will be treated as non-redirects.
     * 3. Must not be used when the page has a non-wikitext contentmodel
     * such as Modulespace Lua or user JavaScript/CSS.
     */
    (flag: false | true): void;
  }
  interface Morebits_wiki_Page_Instance_setMoveDestination {
    (destination: string): void;
  }
  interface Morebits_wiki_Page_Instance_setMoveTalkPage {
    (flag: false | true): void;
  }
  interface Morebits_wiki_Page_Instance_setMoveSubpages {
    (flag: false | true): void;
  }
  interface Morebits_wiki_Page_Instance_setMoveSuppressRedirect {
    (flag: false | true): void;
  }
  interface Morebits_wiki_Page_Instance_setEditProtection {
    /**
     * @param level - The right required for the specific action
     * e.g. autoconfirmed, sysop, templateeditor, extendedconfirmed
     * (enWiki-only).
     */
    (level: string, expiry: string): void;
  }
  interface Morebits_wiki_Page_Instance_setMoveProtection {
    (level: any, expiry: any): void;
  }
  interface Morebits_wiki_Page_Instance_setCreateProtection {
    (level: any, expiry: any): void;
  }
  interface Morebits_wiki_Page_Instance_setCascadingProtection {
    (flag: any): void;
  }
  interface Morebits_wiki_Page_Instance_suppressProtectWarning {
    (): void;
  }
  interface Morebits_wiki_Page_Instance_setDeleteTalkPage {
    (flag: false | true): void;
  }
  interface Morebits_wiki_Page_Instance_setUndeleteTalkPage {
    (flag: false | true): void;
  }
  interface Morebits_wiki_Page_Instance_setOldID {
    (oldID: any): void;
  }
  interface Morebits_wiki_Page_Instance_getCurrentID {
    /**
     * @return The current revision ID of the page
     */
    (): string;
  }
  interface Morebits_wiki_Page_Instance_getRevisionUser {
    /**
     * @return Last editor of the page
     */
    (): string;
  }
  interface Morebits_wiki_Page_Instance_getLastEditTime {
    /**
     * @return ISO 8601 timestamp at which the page was last edited.
     */
    (): string;
  }
  interface Morebits_wiki_Page_Instance_setCallbackParameters {
    /**
     * Define an object for use in a callback function.
     *
     * `callbackParameters` is for use by the caller only. The parameters
     * allow a caller to pass the proper context into its callback
     * function.  Callers must ensure that any changes to the
     * callbackParameters object within a `load()` callback still permit a
     * proper re-entry into the `load()` callback if an edit conflict is
     * detected upon calling `save()`.
     */
    (callbackParameters: any): void;
  }
  interface Morebits_wiki_Page_Instance_getCallbackParameters {
    /**
     * @return - The object previously set by `setCallbackParameters()`.
     */
    (): any;
  }
  interface Morebits_wiki_Page_Instance_setStatusElement {
    (statusElement: Morebits_wiki_Api_statusElement): void;
  }
  interface Morebits_wiki_Page_Instance_getStatusElement {
    /**
     * @return Status element created by the constructor.
     */
    (): Morebits_wiki_Api_statusElement;
  }
  interface Morebits_wiki_Page_Instance_setFlaggedRevs {
    /**
     * @param level - The right required for edits not to require
     * review. Possible options: none, autoconfirmed, review (not on enWiki).
     */
    (level: string, expiry: string): void;
  }
  interface Morebits_wiki_Page_Instance_exists {
    /**
     * @return True if the page existed on the wiki when it was last loaded.
     */
    (): false | true;
  }
  interface Morebits_wiki_Page_Instance_getPageID {
    /**
     * @return Page ID of the page loaded. 0 if the page doesn't
     * exist.
     */
    (): string;
  }
  interface Morebits_wiki_Page_Instance_getContentModel {
    /**
     * @return - Content model of the page.  Possible values
     * include (but may not be limited to): `wikitext`, `javascript`,
     * `css`, `json`, `Scribunto`, `sanitized-css`, `MassMessageListContent`.
     * Also gettable via `mw.config.get('wgPageContentModel')`.
     */
    (): string;
  }
  interface Morebits_wiki_Page_Instance_getWatched {
    /**
     * @return - Watched status of the page. Boolean
     * unless it's being watched temporarily, in which case returns the
     * expiry string.
     */
    (): string | false | true;
  }
  interface Morebits_wiki_Page_Instance_getLoadTime {
    /**
     * @return ISO 8601 timestamp at which the page was last loaded.
     */
    (): string;
  }
  interface Morebits_wiki_Page_Instance_getCreator {
    /**
     * @return The user who created the page following `lookupCreation()`.
     */
    (): string;
  }
  interface Morebits_wiki_Page_Instance_getCreationTimestamp {
    /**
     * @return The ISOString timestamp of page creation following `lookupCreation()`.
     */
    (): string;
  }
  interface Morebits_wiki_Page_Instance_canEdit {
    /**
     * @return whether or not you can edit the page
     */
    (): false | true;
  }
  interface Morebits_wiki_Page_Instance_lookupCreation {
    /**
     * Retrieves the username of the user who created the page as well as
     * the timestamp of creation.  The username can be retrieved using the
     * `getCreator()` function; the timestamp can be retrieved using the
     * `getCreationTimestamp()` function.
     * Prior to June 2019 known as `lookupCreator()`.
     *
     * @param onSuccess - Callback function to be called when
     * the username and timestamp are found within the callback.
     * @param onFailure - Callback function to be called when
     * the lookup fails
     */
    (onSuccess: Function, onFailure: Function): void;
  }
  interface Morebits_wiki_Page_Instance_revert {
    /**
     * Reverts a page to `revertOldID` set by `setOldID`.
     *
     * @param onSuccess - Callback function to run on success.
     * @param onFailure - Callback function to run on failure.
     */
    (onSuccess: Function, onFailure: Function): void;
  }
  interface Morebits_wiki_Page_Instance_move {
    /**
     * Moves a page to another title.
     *
     * @param onSuccess - Callback function to run on success.
     * @param onFailure - Callback function to run on failure.
     */
    (onSuccess: Function, onFailure: Function): void;
  }
  interface Morebits_wiki_Page_Instance_patrol {
    /**
     * Marks the page as patrolled, using `rcid` (if available) or `revid`.
     *
     * Patrolling as such doesn't need to rely on loading the page in
     * question; simply passing a revid to the API is sufficient, so in
     * those cases just using {@link Morebits.wiki.Api} is probably preferable.
     *
     * No error handling since we don't actually care about the errors.
     */
    (): void;
  }
  interface Morebits_wiki_Page_Instance_triage {
    /**
     * Marks the page as reviewed by the PageTriage extension.
     *
     * Will, by it's nature, mark as patrolled as well. Falls back to
     * patrolling if not in an appropriate namespace.
     *
     * Doesn't inherently rely on loading the page in question; simply
     * passing a `pageid` to the API is sufficient, so in those cases just
     * using {@link Morebits.wiki.Api} is probably preferable.
     *
     * Will first check if the page is queued via
     * {@link Morebits.wiki.Page~fnProcessTriageList|fnProcessTriageList}.
     *
     * No error handling since we don't actually care about the errors.
     *
     * @see {@link https://www.mediawiki.org/wiki/Extension:PageTriage} Referred to as "review" on-wiki.
     */
    (): void;
  }
  interface Morebits_wiki_Page_Instance_deletePage {
    /**
     * Deletes a page (for admins only).
     *
     * @param onSuccess - Callback function to run on success.
     * @param onFailure - Callback function to run on failure.
     */
    (onSuccess: Function, onFailure: Function): void;
  }
  interface Morebits_wiki_Page_Instance_undeletePage {
    /**
     * Undeletes a page (for admins only).
     *
     * @param onSuccess - Callback function to run on success.
     * @param onFailure - Callback function to run on failure.
     */
    (onSuccess: Function, onFailure: Function): void;
  }
  interface Morebits_wiki_Page_Instance_protect {
    /**
     * Protects a page (for admins only).
     *
     * @param onSuccess - Callback function to run on success.
     * @param onFailure - Callback function to run on failure.
     */
    (onSuccess: Function, onFailure: Function): void;
  }
  interface Morebits_wiki_Page_Instance_stabilize {
    /**
     * Apply FlaggedRevs protection settings.  Only works on wikis where
     * the extension is installed (`$wgFlaggedRevsProtection = true`
     * i.e. where FlaggedRevs settings appear on the "protect" tab).
     *
     * @see {@link https://www.mediawiki.org/wiki/Extension:FlaggedRevs}Referred to as "pending changes" on-wiki.
     */
    (onSuccess: Function, onFailure: Function): void;
  }
  interface Morebits_wiki_Preview {
    /**
     * Use the API to parse a fragment of wikitext and render it as HTML.
     *
     * The suggested implementation pattern (in {@link Morebits.SimpleWindow} and
     * {@link Morebits.QuickForm} situations) is to construct a
     * `Morebits.wiki.Preview` object after rendering a `Morebits.QuickForm`, and
     * bind the object to an arbitrary property of the form (e.g. |previewer|).
     * For an example, see twinklewarn.js.
     *
     * @param previewbox - The element that will contain the rendered HTML,
     * usually a <div> element.
     */
    new (previewbox: HTMLElement): Morebits_wiki_Preview_Instance;
    /**
     * Use the API to parse a fragment of wikitext and render it as HTML.
     *
     * The suggested implementation pattern (in {@link Morebits.SimpleWindow} and
     * {@link Morebits.QuickForm} situations) is to construct a
     * `Morebits.wiki.Preview` object after rendering a `Morebits.QuickForm`, and
     * bind the object to an arbitrary property of the form (e.g. |previewer|).
     * For an example, see twinklewarn.js.
     *
     * @param previewbox - The element that will contain the rendered HTML,
     * usually a <div> element.
     */
    (previewbox: HTMLElement): void;
    prototype: Morebits_wiki_Preview_Instance;
  }
  interface Morebits_wiki_Preview_Instance {
    previewbox: HTMLElement;
    /**
     * Displays the preview box, and begins an asynchronous attempt
     * to render the specified wikitext.
     *
     * @param wikitext - Wikitext to render; most things should work, including `subst:` and `~~~~`.
     * @param pageTitle - Optional parameter for the page this should be rendered as being on, if omitted it is taken as the current page.
     * @param sectionTitle - If provided, render the text as a new section using this as the title.
     */
    beginRender: Morebits_wiki_Preview_Instance_beginRender;
    /**
     * Hides the preview box and clears it.
     */
    closePreview: Morebits_wiki_Preview_Instance_closePreview;
  }
  interface Morebits_wiki_Preview_Instance_beginRender {
    /**
     * Displays the preview box, and begins an asynchronous attempt
     * to render the specified wikitext.
     *
     * @param wikitext - Wikitext to render; most things should work, including `subst:` and `~~~~`.
     * @param pageTitle - Optional parameter for the page this should be rendered as being on, if omitted it is taken as the current page.
     * @param sectionTitle - If provided, render the text as a new section using this as the title.
     */
    (wikitext: string, pageTitle: string, sectionTitle: string): JQuery.Promise;
  }
  interface Morebits_wiki_Preview_Instance_closePreview {
    /**
     * Hides the preview box and clears it.
     */
    (): void;
  }
  interface Morebits_wikitext {
    /**
     * Get the value of every parameter found in the wikitext of a given template.
     *
     * @param text - Wikitext containing a template.
     * @param start - Index noting where in the text the template begins.
     * @return `{name: templateName, parameters: {key: value}}`.
     */
    parseTemplate: Morebits_wikitext_parseTemplate;
    /**
     * Adjust and manipulate the wikitext of a page.
     *
     * @param text - Wikitext to be manipulated.
     */
    Page: Morebits_wikitext_Page;
    page: Morebits_wikitext_Page;
  }
  interface Morebits_wikitext_parseTemplate {
    /**
     * Get the value of every parameter found in the wikitext of a given template.
     *
     * @param text - Wikitext containing a template.
     * @param start - Index noting where in the text the template begins.
     * @return `{name: templateName, parameters: {key: value}}`.
     */
    (text: string, start: number): any;
  }
  interface Morebits_wikitext_Page {
    /**
     * Adjust and manipulate the wikitext of a page.
     *
     * @param text - Wikitext to be manipulated.
     */
    new (text: string): Morebits_wikitext_Page_Instance;
    /**
     * Adjust and manipulate the wikitext of a page.
     *
     * @param text - Wikitext to be manipulated.
     */
    (text: string): void;
    prototype: Morebits_wikitext_Page_Instance;
  }
  interface Morebits_wikitext_Page_Instance {
    text: string;
    /**
     * Removes links to `link_target` from the page text.
     */
    removeLink: Morebits_wikitext_Page_Instance_removeLink;
    /**
     * Comments out images from page text; if used in a gallery, deletes the whole line.
     * If used as a template argument (not necessarily with `File:` prefix), the template parameter is commented out.
     *
     * @param image - Image name without `File:` prefix.
     * @param reason - Reason to be included in comment, alongside the commented-out image.
     */
    commentOutImage: Morebits_wikitext_Page_Instance_commentOutImage;
    /**
     * Converts uses of [[File:`image`]] to [[File:`image`|`data`]].
     *
     * @param image - Image name without File: prefix.
     * @param data - The display options.
     */
    addToImageComment: Morebits_wikitext_Page_Instance_addToImageComment;
    /**
     * Remove all transclusions of a template from page text.
     *
     * @param template - Page name whose transclusions are to be removed,
     * include namespace prefix only if not in template namespace.
     */
    removeTemplate: Morebits_wikitext_Page_Instance_removeTemplate;
    /**
     * Smartly insert a tag atop page text but after specified templates,
     * such as hatnotes, short description, or deletion and protection templates.
     * Notably, does *not* insert a newline after the tag.
     *
     * @param tag - The tag to be inserted.
     * @param regex - Templates after which to insert tag,
     * given as either as a (regex-valid) string or an array to be joined by pipes.
     * @param flags - Regex flags to apply.  `''` to provide no flags;
     * other falsey values will default to `i`.
     * @param preRegex - Optional regex string or array to match
     * before any template matches (i.e. before `{{`), such as html comments.
     */
    insertAfterTemplates: Morebits_wikitext_Page_Instance_insertAfterTemplates;
    /**
     * Get the manipulated wikitext.
     */
    getText: Morebits_wikitext_Page_Instance_getText;
  }
  interface Morebits_wikitext_Page_Instance_removeLink {
    new (): Morebits_wikitext_Page_Instance_removeLink_Instance;
    /**
     * Removes links to `link_target` from the page text.
     */
    (link_target: string): Morebits_wikitext_Page_Instance;
    prototype: Morebits_wikitext_Page_Instance_removeLink_Instance;
  }
  interface Morebits_wikitext_Page_Instance_removeLink_Instance {
    text: any;
  }
  interface Morebits_wikitext_Page_Instance_commentOutImage {
    new (): Morebits_wikitext_Page_Instance_commentOutImage_Instance;
    /**
     * Comments out images from page text; if used in a gallery, deletes the whole line.
     * If used as a template argument (not necessarily with `File:` prefix), the template parameter is commented out.
     *
     * @param image - Image name without `File:` prefix.
     * @param reason - Reason to be included in comment, alongside the commented-out image.
     */
    (image: string, reason: string): Morebits_wikitext_Page_Instance;
    prototype: Morebits_wikitext_Page_Instance_commentOutImage_Instance;
  }
  interface Morebits_wikitext_Page_Instance_commentOutImage_Instance {
    text: string;
  }
  interface Morebits_wikitext_Page_Instance_addToImageComment {
    new (): Morebits_wikitext_Page_Instance_addToImageComment_Instance;
    /**
     * Converts uses of [[File:`image`]] to [[File:`image`|`data`]].
     *
     * @param image - Image name without File: prefix.
     * @param data - The display options.
     */
    (image: string, data: string): Morebits_wikitext_Page_Instance;
    prototype: Morebits_wikitext_Page_Instance_addToImageComment_Instance;
  }
  interface Morebits_wikitext_Page_Instance_addToImageComment_Instance {
    text: any;
  }
  interface Morebits_wikitext_Page_Instance_removeTemplate {
    new (): Morebits_wikitext_Page_Instance_removeTemplate_Instance;
    /**
     * Remove all transclusions of a template from page text.
     *
     * @param template - Page name whose transclusions are to be removed,
     * include namespace prefix only if not in template namespace.
     */
    (template: string): Morebits_wikitext_Page_Instance;
    prototype: Morebits_wikitext_Page_Instance_removeTemplate_Instance;
  }
  interface Morebits_wikitext_Page_Instance_removeTemplate_Instance {
    text: any;
  }
  interface Morebits_wikitext_Page_Instance_insertAfterTemplates {
    new (): Morebits_wikitext_Page_Instance_insertAfterTemplates_Instance;
    /**
     * Smartly insert a tag atop page text but after specified templates,
     * such as hatnotes, short description, or deletion and protection templates.
     * Notably, does *not* insert a newline after the tag.
     *
     * @param tag - The tag to be inserted.
     * @param regex - Templates after which to insert tag,
     * given as either as a (regex-valid) string or an array to be joined by pipes.
     * @param flags - Regex flags to apply.  `''` to provide no flags;
     * other falsey values will default to `i`.
     * @param preRegex - Optional regex string or array to match
     * before any template matches (i.e. before `{{`), such as html comments.
     */
    (
      tag: string,
      regex: string | string[],
      flags: string,
      preRegex: string | string[],
    ): Morebits_wikitext_Page_Instance;
    prototype: Morebits_wikitext_Page_Instance_insertAfterTemplates_Instance;
  }
  interface Morebits_wikitext_Page_Instance_insertAfterTemplates_Instance {
    text: any;
  }
  interface Morebits_wikitext_Page_Instance_getText {
    /**
     * Get the manipulated wikitext.
     */
    (): string;
  }
  interface Morebits_UserspaceLogger {
    /**
     * Handles logging actions to a userspace log.
     * Used in CSD, PROD, and XFD.
     *
     * @param logPageName - Title of the subpage of the current user's log.
     */
    new (logPageName: string): Morebits_UserspaceLogger_Instance;
    /**
     * Handles logging actions to a userspace log.
     * Used in CSD, PROD, and XFD.
     *
     * @param logPageName - Title of the subpage of the current user's log.
     */
    (logPageName: string): void;
    prototype: Morebits_UserspaceLogger_Instance;
  }
  interface Morebits_UserspaceLogger_Instance {
    /**
     * The text to prefix the log with upon creation, defaults to empty.
     */
    initialText: string;
    /**
     * The header level to use for months, defaults to 3 (`===`).
     */
    headerLevel: number;
    changeTags: string;
    /**
     * Log the entry.
     *
     * @param logText - Doesn't include leading `#` or `*`.
     * @param summaryText - Edit summary.
     */
    log: Morebits_UserspaceLogger_Instance_log;
  }
  interface Morebits_UserspaceLogger_Instance_log {
    /**
     * Log the entry.
     *
     * @param logText - Doesn't include leading `#` or `*`.
     * @param summaryText - Edit summary.
     */
    (logText: string, summaryText: string): JQuery.Promise;
  }
  interface Morebits_Status {
    /**
     * Create and show status messages of varying urgency.
     * {@link Morebits.Status.initMorebits.Status.init()} must be called before
     * any status object is created, otherwise those statuses won't be visible.
     *
     * @param text - Text before the the colon `:`.
     * @param stat - Text after the colon `:`.
     * @param type - Determine the font color of the status
     * line, allowable values are: `status` (blue), `info` (green), `warn` (red),
     * or `error` (bold red).
     */
    new (
      text: string,
      stat: string,
      type: string,
    ): Morebits_wiki_Api_statusElement;
    /**
     * Create and show status messages of varying urgency.
     * {@link Morebits.Status.initMorebits.Status.init()} must be called before
     * any status object is created, otherwise those statuses won't be visible.
     *
     * @param text - Text before the the colon `:`.
     * @param stat - Text after the colon `:`.
     * @param type - Determine the font color of the status
     * line, allowable values are: `status` (blue), `info` (green), `warn` (red),
     * or `error` (bold red).
     */
    (text: string, stat: string, type: string): void;
    /**
     * Specify an area for status message elements to be added to.
     *
     * @param root - Usually a div element.
     * @throws {Error} If `root` is not an `HTMLElement`.
     */
    init: Morebits_Status_init;
    root: any;
    /**
     * @param handler - Function to execute on error.
     * @throws {Error} When `handler` is not a function.
     */
    onError: Morebits_Status_onError;
    /**
     * @param text - Before colon
     * @param status - After colon
     * @return - `status`-type (blue)
     */
    status: Morebits_Status_status;
    /**
     * @param text - Before colon
     * @param status - After colon
     * @return - `info`-type (green)
     */
    info: Morebits_Status_info;
    /**
     * @param text - Before colon
     * @param status - After colon
     * @return - `warn`-type (red)
     */
    warn: Morebits_Status_warn;
    /**
     * @param text - Before colon
     * @param status - After colon
     * @return - `error`-type (bold red)
     */
    error: Morebits_Status_error;
    /**
     * For the action complete message at the end, create a status line without
     * a colon separator.
     */
    actionCompleted: Morebits_Status_actionCompleted;
    /**
     * Display the user's rationale, comments, etc. Back to them after a failure,
     * so that they may re-use it.
     */
    printUserText: Morebits_Status_printUserText;
    prototype: Morebits_wiki_Api_statusElement;
  }
  interface Morebits_Status_init {
    /**
     * Specify an area for status message elements to be added to.
     *
     * @param root - Usually a div element.
     * @throws {Error} If `root` is not an `HTMLElement`.
     */
    (root: HTMLElement): void;
  }
  interface Morebits_Status_onError {
    /**
     * @param handler - Function to execute on error.
     * @throws {Error} When `handler` is not a function.
     */
    (handler: Function): void;
  }
  interface Morebits_Status_status {
    /**
     * @param text - Before colon
     * @param status - After colon
     * @return - `status`-type (blue)
     */
    (text: string, status: string): Morebits_wiki_Api_statusElement;
  }
  interface Morebits_Status_info {
    /**
     * @param text - Before colon
     * @param status - After colon
     * @return - `info`-type (green)
     */
    (text: string, status: string): Morebits_wiki_Api_statusElement;
  }
  interface Morebits_Status_warn {
    /**
     * @param text - Before colon
     * @param status - After colon
     * @return - `warn`-type (red)
     */
    (text: string, status: string): Morebits_wiki_Api_statusElement;
  }
  interface Morebits_Status_error {
    /**
     * @param text - Before colon
     * @param status - After colon
     * @return - `error`-type (bold red)
     */
    (text: string, status: string): Morebits_wiki_Api_statusElement;
  }
  interface Morebits_Status_actionCompleted {
    /**
     * For the action complete message at the end, create a status line without
     * a colon separator.
     */
    (text: string): void;
  }
  interface Morebits_Status_printUserText {
    /**
     * Display the user's rationale, comments, etc. Back to them after a failure,
     * so that they may re-use it.
     */
    (comments: string, message: string): void;
  }
  interface Morebits_htmlNode {
    /**
     * Simple helper function to create a simple node.
     *
     * @param type - Type of HTML element.
     * @param content - Text content.
     * @param color - Font color.
     */
    (type: string, content: string, color: string): HTMLElement;
  }
  interface Morebits_checkboxShiftClickSupport {
    /**
     * Add shift-click support for checkboxes. The wikibits version
     * (`window.addCheckboxClickHandlers`) has some restrictions, and doesn't work
     * with checkboxes inside a sortable table, so let's build our own.
     */
    (jQuerySelector: JQueryStatic, jQueryContext: JQueryStatic): void;
  }
  interface Morebits_BatchOperation {
    /**
     * Iterates over a group of pages (or arbitrary objects) and executes a worker function
     * for each.
     *
     * `setPageList(pageList)`: Sets the list of pages to work on. It should be an
     * array of page names strings.
     *
     * `setOption(optionName, optionValue)`: Sets a known option:
     * - `chunkSize` (integer): The size of chunks to break the array into (default
     * 50). Setting this to a small value (<5) can cause problems.
     * - `preserveIndividualStatusLines` (boolean): Keep each page's status element
     * visible when worker is complete? See note below.
     *
     * `run(worker, postFinish)`: Runs the callback `worker` for each page in the
     * list.  The callback must call `workerSuccess` when succeeding, or
     * `workerFailure` when failing.  If using {@link Morebits.wiki.Api} or
     * {@link Morebits.wiki.Page}, this is easily done by passing these two
     * functions as parameters to the methods on those objects: for instance,
     * `page.save(batchOp.workerSuccess, batchOp.workerFailure)`.  Make sure the
     * methods are called directly if special success/failure cases arise.  If you
     * omit to call these methods, the batch operation will stall after the first
     * chunk!  Also ensure that either workerSuccess or workerFailure is called no
     * more than once.  The second callback `postFinish` is executed when the
     * entire batch has been processed.
     *
     * If using `preserveIndividualStatusLines`, you should try to ensure that the
     * `workerSuccess` callback has access to the page title.  This is no problem for
     * {@link Morebits.wiki.Page} objects.  But when using the API, please set the
     * |pageName| property on the {@link Morebits.wiki.Api} object.
     *
     * There are sample batchOperation implementations using Morebits.wiki.Page in
     * twinklebatchdelete.js, twinklebatchundelete.js, and twinklebatchprotect.js.
     */
    new (currentAction: string): Morebits_BatchOperation_Instance;
    /**
     * Iterates over a group of pages (or arbitrary objects) and executes a worker function
     * for each.
     *
     * `setPageList(pageList)`: Sets the list of pages to work on. It should be an
     * array of page names strings.
     *
     * `setOption(optionName, optionValue)`: Sets a known option:
     * - `chunkSize` (integer): The size of chunks to break the array into (default
     * 50). Setting this to a small value (<5) can cause problems.
     * - `preserveIndividualStatusLines` (boolean): Keep each page's status element
     * visible when worker is complete? See note below.
     *
     * `run(worker, postFinish)`: Runs the callback `worker` for each page in the
     * list.  The callback must call `workerSuccess` when succeeding, or
     * `workerFailure` when failing.  If using {@link Morebits.wiki.Api} or
     * {@link Morebits.wiki.Page}, this is easily done by passing these two
     * functions as parameters to the methods on those objects: for instance,
     * `page.save(batchOp.workerSuccess, batchOp.workerFailure)`.  Make sure the
     * methods are called directly if special success/failure cases arise.  If you
     * omit to call these methods, the batch operation will stall after the first
     * chunk!  Also ensure that either workerSuccess or workerFailure is called no
     * more than once.  The second callback `postFinish` is executed when the
     * entire batch has been processed.
     *
     * If using `preserveIndividualStatusLines`, you should try to ensure that the
     * `workerSuccess` callback has access to the page title.  This is no problem for
     * {@link Morebits.wiki.Page} objects.  But when using the API, please set the
     * |pageName| property on the {@link Morebits.wiki.Api} object.
     *
     * There are sample batchOperation implementations using Morebits.wiki.Page in
     * twinklebatchdelete.js, twinklebatchundelete.js, and twinklebatchprotect.js.
     */
    (currentAction: string): void;
    prototype: Morebits_BatchOperation_Instance;
  }
  interface Morebits_BatchOperation_Instance {
    getStatusElement: Morebits_BatchOperation_Instance_getStatusElement;
    /**
     * Sets the list of pages to work on.
     *
     * @param pageList - Array of objects over which you wish to execute the worker function
     * This is usually the list of page names (strings).
     */
    setPageList: Morebits_BatchOperation_Instance_setPageList;
    /**
     * Sets a known option.
     *
     * @param optionName - Name of the option:
     * - chunkSize (integer): The size of chunks to break the array into
     * (default 50). Setting this to a small value (<5) can cause problems.
     * - preserveIndividualStatusLines (boolean): Keep each page's status
     * element visible when worker is complete?
     * @param optionValue - Value to which the option is
     * to be set. Should be an integer for chunkSize and a boolean for
     * preserveIndividualStatusLines.
     */
    setOption: Morebits_BatchOperation_Instance_setOption;
    /**
     * Runs the first callback for each page in the list.
     * The callback must call workerSuccess when succeeding, or workerFailure when failing.
     * Runs the optional second callback when the whole batch has been processed.
     */
    run: Morebits_BatchOperation_Instance_run;
    /**
     * To be called by worker before it terminates successfully.
     *
     * @param arg -
     * This should be the `Morebits.wiki.Page` or `Morebits.wiki.Api` object used by worker
     * (for the adjustment of status lines emitted by them).
     * If no Morebits.wiki.* object is used (e.g. you're using `mw.Api()` or something else), and
     * `preserveIndividualStatusLines` option is on, give the page name (string) as argument.
     */
    workerSuccess: Morebits_BatchOperation_Instance_workerSuccess;
    workerFailure: Morebits_BatchOperation_Instance_workerFailure;
  }
  interface Morebits_BatchOperation_Instance_getStatusElement {
    (): Morebits_wiki_Api_statusElement;
  }
  interface Morebits_BatchOperation_Instance_setPageList {
    /**
     * Sets the list of pages to work on.
     *
     * @param pageList - Array of objects over which you wish to execute the worker function
     * This is usually the list of page names (strings).
     */
    (pageList: any[]): void;
  }
  interface Morebits_BatchOperation_Instance_setOption {
    /**
     * Sets a known option.
     *
     * @param optionName - Name of the option:
     * - chunkSize (integer): The size of chunks to break the array into
     * (default 50). Setting this to a small value (<5) can cause problems.
     * - preserveIndividualStatusLines (boolean): Keep each page's status
     * element visible when worker is complete?
     * @param optionValue - Value to which the option is
     * to be set. Should be an integer for chunkSize and a boolean for
     * preserveIndividualStatusLines.
     */
    (optionName: string, optionValue: number | false | true): void;
  }
  interface Morebits_BatchOperation_Instance_run {
    /**
     * Runs the first callback for each page in the list.
     * The callback must call workerSuccess when succeeding, or workerFailure when failing.
     * Runs the optional second callback when the whole batch has been processed.
     */
    (worker: Function, postFinish: Function): void;
  }
  interface Morebits_BatchOperation_Instance_workerSuccess {
    /**
     * To be called by worker before it terminates successfully.
     *
     * @param arg -
     * This should be the `Morebits.wiki.Page` or `Morebits.wiki.Api` object used by worker
     * (for the adjustment of status lines emitted by them).
     * If no Morebits.wiki.* object is used (e.g. you're using `mw.Api()` or something else), and
     * `preserveIndividualStatusLines` option is on, give the page name (string) as argument.
     */
    (
      arg: string | Morebits_wiki_Api_Instance | Morebits_wiki_Page_Instance,
    ): void;
  }
  interface Morebits_BatchOperation_Instance_workerFailure {
    (): void;
  }
  interface Morebits_TaskManager {
    /**
     * Given a set of asynchronous functions to run along with their dependencies,
     * run them in an efficient sequence so that multiple functions
     * that don't depend on each other are triggered simultaneously. Where
     * dependencies exist, it ensures that the dependency functions finish running
     * before the dependent function runs. The values resolved by the dependencies
     * are made available to the dependant as arguments.
     */
    new (context: any): Morebits_TaskManager_Instance;
    /**
     * Given a set of asynchronous functions to run along with their dependencies,
     * run them in an efficient sequence so that multiple functions
     * that don't depend on each other are triggered simultaneously. Where
     * dependencies exist, it ensures that the dependency functions finish running
     * before the dependent function runs. The values resolved by the dependencies
     * are made available to the dependant as arguments.
     */
    (context: any): void;
    prototype: Morebits_TaskManager_Instance;
  }
  interface Morebits_TaskManager_Instance {
    taskDependencyMap: Map<any, any>;
    failureCallbackMap: Map<any, any>;
    deferreds: Map<any, any>;
    context: any;
    /**
     * Register a task along with its dependencies (tasks which should have finished
     * execution before we can begin this one). Each task is a function that must return
     * a promise. The function will get the values resolved by the dependency functions
     * as arguments.
     *
     * @param func - A task.
     * @param deps - Its dependencies.
     * @param onFailure - a failure callback that's run if the task or any one
     * of its dependencies fail.
     */
    add: Morebits_TaskManager_Instance_add;
    /**
     * Run all the tasks. Multiple tasks may be run at once.
     *
     * @return - Resolved if all tasks succeed, rejected otherwise.
     */
    execute: Morebits_TaskManager_Instance_execute;
  }
  interface Morebits_TaskManager_Instance_add {
    /**
     * Register a task along with its dependencies (tasks which should have finished
     * execution before we can begin this one). Each task is a function that must return
     * a promise. The function will get the values resolved by the dependency functions
     * as arguments.
     *
     * @param func - A task.
     * @param deps - Its dependencies.
     * @param onFailure - a failure callback that's run if the task or any one
     * of its dependencies fail.
     */
    (func: Function, deps: Function[], onFailure: Function): void;
  }
  interface Morebits_TaskManager_Instance_execute {
    /**
     * Run all the tasks. Multiple tasks may be run at once.
     *
     * @return - Resolved if all tasks succeed, rejected otherwise.
     */
    (): JQuery.Promise;
  }
  interface Morebits_SimpleWindow {
    /**
     * A simple draggable window. No longer uses jQuery UI.
     *
     * @param height - The maximum allowable height for the content area.
     */
    new (width: number, height: number): Morebits_SimpleWindow_Instance;
    /**
     * A simple draggable window. No longer uses jQuery UI.
     *
     * @param height - The maximum allowable height for the content area.
     */
    (width: number, height: number): void;
    /**
     * Enables or disables all footer buttons on all {@link Morebits.SimpleWindow}s in the current page.
     * This should be called with `false` when the button(s) become irrelevant (e.g. just before
     * {@link Morebits.Status.init} is called).
     * This is not an instance method so that consumers don't have to keep a reference to the
     * original `Morebits.SimpleWindow` object sitting around somewhere. Anyway, most of the time
     * there will only be one `Morebits.SimpleWindow` open, so this shouldn't matter.
     */
    setButtonsEnabled: Morebits_SimpleWindow_setButtonsEnabled;
    prototype: Morebits_SimpleWindow_Instance;
  }
  interface Morebits_SimpleWindow_Instance {
    $dialog: any;
    content: any;
    height: number;
    buttons: undefined[];
    hasFooterLinks: false | true;
    scriptName: null;
    /**
     * Bring a dialog to the top, when there are other overlapping dialogs open.
     */
    focus: Morebits_SimpleWindow_Instance_focus;
    /**
     * Closes the dialog. If this is set as an event handler, it will stop the event
     * from doing anything more.
     */
    close: Morebits_SimpleWindow_Instance_close;
    /**
     * Shows the dialog. Calling display() on a dialog that has previously been closed
     * might work, but it is not guaranteed.
     */
    display: Morebits_SimpleWindow_Instance_display;
    /**
     * Sets the dialog title.
     */
    setTitle: Morebits_SimpleWindow_Instance_setTitle;
    /**
     * Sets the script name, appearing as a prefix to the title to help users determine which
     * user script is producing which dialog. For instance, Twinkle modules set this to "Twinkle".
     */
    setScriptName: Morebits_SimpleWindow_Instance_setScriptName;
    /**
     * Sets the dialog width.
     */
    setWidth: Morebits_SimpleWindow_Instance_setWidth;
    /**
     * Sets the dialog's maximum height. The dialog will auto-size to fit its contents.
     */
    setHeight: Morebits_SimpleWindow_Instance_setHeight;
    /**
     * Sets the content of the dialog to the given element node, usually from rendering
     * a {@link Morebits.QuickForm}.
     * Re-enumerates the footer buttons, but leaves the footer links as they are.
     * Be sure to call this at least once before the dialog is displayed...
     */
    setContent: Morebits_SimpleWindow_Instance_setContent;
    /**
     * Adds the given element node to the dialog content.
     */
    addContent: Morebits_SimpleWindow_Instance_addContent;
    /**
     * Removes all contents from the dialog, barring any footer links.
     */
    purgeContent: Morebits_SimpleWindow_Instance_purgeContent;
    /**
     * Adds a link in the bottom-right corner of the dialog.
     * This can be used to provide help or policy links.
     * For example, Twinkle's CSD module adds a link to the CSD policy page,
     * as well as a link to Twinkle's documentation.
     *
     * @param text - Display text.
     * @param wikiPage - Link target.
     */
    addFooterLink: Morebits_SimpleWindow_Instance_addFooterLink;
    /**
     * Sets whether the window should be modal or not. Modal dialogs create
     * an overlay below the dialog but above other page elements. This
     * must be used (if necessary) before calling display().
     *
     * @param modal - If set to true, other items on the
     * page will be disabled, i.e., cannot be interacted with.
     */
    setModality: Morebits_SimpleWindow_Instance_setModality;
  }
  interface Morebits_SimpleWindow_Instance_focus {
    /**
     * Bring a dialog to the top, when there are other overlapping dialogs open.
     */
    (): Morebits_SimpleWindow_Instance;
  }
  interface Morebits_SimpleWindow_Instance_close {
    /**
     * Closes the dialog. If this is set as an event handler, it will stop the event
     * from doing anything more.
     */
    (event: Event): Morebits_SimpleWindow_Instance;
  }
  interface Morebits_SimpleWindow_Instance_display {
    /**
     * Shows the dialog. Calling display() on a dialog that has previously been closed
     * might work, but it is not guaranteed.
     */
    (): Morebits_SimpleWindow_Instance;
  }
  interface Morebits_SimpleWindow_Instance_setTitle {
    /**
     * Sets the dialog title.
     */
    (title: string): Morebits_SimpleWindow_Instance;
  }
  interface Morebits_SimpleWindow_Instance_setScriptName {
    new (): Morebits_SimpleWindow_Instance_setScriptName_Instance;
    /**
     * Sets the script name, appearing as a prefix to the title to help users determine which
     * user script is producing which dialog. For instance, Twinkle modules set this to "Twinkle".
     */
    (name: string): Morebits_SimpleWindow_Instance;
    prototype: Morebits_SimpleWindow_Instance_setScriptName_Instance;
  }
  interface Morebits_SimpleWindow_Instance_setScriptName_Instance {
    scriptName: string;
  }
  interface Morebits_SimpleWindow_Instance_setWidth {
    /**
     * Sets the dialog width.
     */
    (width: number): Morebits_SimpleWindow_Instance;
  }
  interface Morebits_SimpleWindow_Instance_setHeight {
    /**
     * Sets the dialog's maximum height. The dialog will auto-size to fit its contents.
     */
    (height: number): Morebits_SimpleWindow_Instance;
  }
  interface Morebits_SimpleWindow_Instance_setContent {
    /**
     * Sets the content of the dialog to the given element node, usually from rendering
     * a {@link Morebits.QuickForm}.
     * Re-enumerates the footer buttons, but leaves the footer links as they are.
     * Be sure to call this at least once before the dialog is displayed...
     */
    (content: HTMLElement): Morebits_SimpleWindow_Instance;
  }
  interface Morebits_SimpleWindow_Instance_addContent {
    /**
     * Adds the given element node to the dialog content.
     */
    (content: HTMLElement): Morebits_SimpleWindow_Instance;
  }
  interface Morebits_SimpleWindow_Instance_purgeContent {
    new (): Morebits_SimpleWindow_Instance_purgeContent_Instance;
    /**
     * Removes all contents from the dialog, barring any footer links.
     */
    (): Morebits_SimpleWindow_Instance;
    prototype: Morebits_SimpleWindow_Instance_purgeContent_Instance;
  }
  interface Morebits_SimpleWindow_Instance_purgeContent_Instance {
    buttons: any[];
  }
  interface Morebits_SimpleWindow_Instance_addFooterLink {
    new (): Morebits_SimpleWindow_Instance_addFooterLink_Instance;
    /**
     * Adds a link in the bottom-right corner of the dialog.
     * This can be used to provide help or policy links.
     * For example, Twinkle's CSD module adds a link to the CSD policy page,
     * as well as a link to Twinkle's documentation.
     *
     * @param text - Display text.
     * @param wikiPage - Link target.
     */
    (text: string, wikiPage: string): Morebits_SimpleWindow_Instance;
    prototype: Morebits_SimpleWindow_Instance_addFooterLink_Instance;
  }
  interface Morebits_SimpleWindow_Instance_addFooterLink_Instance {
    hasFooterLinks: false | true;
  }
  interface Morebits_SimpleWindow_Instance_setModality {
    /**
     * Sets whether the window should be modal or not. Modal dialogs create
     * an overlay below the dialog but above other page elements. This
     * must be used (if necessary) before calling display().
     *
     * @param modal - If set to true, other items on the
     * page will be disabled, i.e., cannot be interacted with.
     */
    (modal: false | true): Morebits_SimpleWindow_Instance;
  }
  interface Morebits_SimpleWindow_setButtonsEnabled {
    /**
     * Enables or disables all footer buttons on all {@link Morebits.SimpleWindow}s in the current page.
     * This should be called with `false` when the button(s) become irrelevant (e.g. just before
     * {@link Morebits.Status.init} is called).
     * This is not an instance method so that consumers don't have to keep a reference to the
     * original `Morebits.SimpleWindow` object sitting around somewhere. Anyway, most of the time
     * there will only be one `Morebits.SimpleWindow` open, so this shouldn't matter.
     */
    (enabled: false | true): void;
  }
  const Morebits: Morebits;
}
