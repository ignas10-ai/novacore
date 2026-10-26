// jsdom reports navigator.language "en-US", which would switch src/i18n to English: the unit tests check the
// Lithuanian copy (the default language), so pin it. i18n.test.ts sets the other cases itself.
if(typeof navigator!=="undefined")Object.defineProperty(navigator,"language",{value:"lt-LT",configurable:true});
