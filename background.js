function protocolIsApplicable(tabUrl) {
    const APPLICABLE_PROTOCOLS = ['http:', 'https:'];
    let url = new URL(tabUrl);
    return APPLICABLE_PROTOCOLS.includes(url.protocol);
}

async function userAlwaysWantsIcon() {
    let option = await browser.storage.local.get("alwaysShowPageAction");

    if (typeof option.alwaysShowPageAction !== "boolean") {
        return false;
    } else {
        return option.alwaysShowPageAction;
    }
}

async function userWantsImmediateTranslation() {
    let option = await browser.storage.local.get("automaticallyTranslate");

    if (typeof option.automaticallyTranslate !== "boolean") {
        return false;
    } else {
        return option.automaticallyTranslate;
    }
}

async function getPageLanguage(tabId) {
    if(!browser.tabs.detectLanguage) {
        browser.storage.local.set({alwaysShowPageAction: true});
        return "und";
    }
    return await browser.tabs.detectLanguage(tabId);
}

function pageIsInForeignLanguage(pageLanguage) {
    // Normalize page language and browser languages
    pageLanguage = pageLanguage.toLowerCase();

    // If language is unknown, better to show the UI
    if (pageLanguage === "und") {
        return true;
    }

    let navigatorLanguages = navigator.languages.map(navigatorLanguage => {
        return navigatorLanguage.toLowerCase();
    });

    // Check if the page's language explicitly matches any of browser's preferred languages
    if (navigatorLanguages.includes(pageLanguage)) {
        return false;
    }

    // If you're still here, then check for match of primary language subtags
    // If so, assume close enough to native language.

    // Get array of the primary languages from the browser, i.e. those without a hyphen
    // Ex: `en` but not `en-SV`
    let primaryLanguageSubtags = navigatorLanguages.filter(language => {
        return language.indexOf('-') === -1;
    });

    // If no primary language subtag specified in browser, the user has explicitly removed it,
    // so assume they want explicit language match instead of partial match.
    if (primaryLanguageSubtags.length === 0) {
        return true;
    }

    // Get page's language subtag
    let pageLanguageSubtag = pageLanguage.split('-', 1)[0];

    // Look for primary language subtag match
    if (primaryLanguageSubtags.includes(pageLanguageSubtag)) {
        return false;
    }

    // No match, so page is in foreign language.
    return true;
}

/*
Show the Page Translator page action in the browser address bar, if applicable.
If user always wants the icon, show it.
If page is in foreign language, show it.
    If user wants auto translation, invoke it.
*/
async function initializePageAction(tabId, url) {
    if(!url) {
        let tab = await browser.tabs.get(tabId);
        url = tab.url;
    }

    if (!url || !protocolIsApplicable(url)) {
        browser.pageAction.hide(tabId);
        return;
    }

    let autoTranslate = await userWantsImmediateTranslation() === true;
    let alwaysShowPageAction = await userAlwaysWantsIcon() === true;

    if (alwaysShowPageAction && !autoTranslate) {
        browser.pageAction.show(tabId);
        return;
    }

    let pageLanguage = await getPageLanguage(tabId);
    let pageLanguageKnown = pageLanguage !== "und";
    let pageNeedsTranslating = pageIsInForeignLanguage(pageLanguage);

    if (pageLanguageKnown && pageNeedsTranslating && autoTranslate) {
        doTranslator({id: tabId, url: url});
        browser.pageAction.hide(tabId);
        return;
    }

    if (pageNeedsTranslating || alwaysShowPageAction) {
        browser.pageAction.show(tabId);
    } else {
        browser.pageAction.hide(tabId);
    }
}


function doTranslator(tab) {
    let executeScript = function(option) {
        let url = tab.url;

        if ((typeof option.translationService !== "undefined") &&
            (option.translationService === "microsoft")) {
            url = `https://ssl.microsofttranslator.com/bv.aspx?from=&to=&a=${encodeURIComponent(url)}`;
        } else {
            url = `https://translate.google.com/translate?sl=auto&tl=auto&u=${encodeURIComponent(url)}`;
        }

        browser.tabs.update(tab.id,{url: url});
    };

    browser.storage.local.get("translationService").then(executeScript);
}

browser.tabs.onActivated.addListener((activeInfo) => {
    initializePageAction(activeInfo.tabId);
});

try {
    browser.tabs.onUpdated.addListener((id, changeInfo, tab) => {
        if ((typeof changeInfo.status === "string") && (changeInfo.status === "complete")) {
            initializePageAction(tab.id, tab.url);
        }
    }, {properties: ["status"]});
} catch(err) {
    browser.tabs.onUpdated.addListener((id, changeInfo, tab) => {
        if ((typeof changeInfo.status === "string") && (changeInfo.status === "complete")) {
            initializePageAction(tab.id, tab.url);
        }
    });
}

browser.pageAction.onClicked.addListener(doTranslator);
