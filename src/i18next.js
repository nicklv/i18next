(function($) {

    //defaults
    var o = {
        lng: false,
        fallbackLng: 'dev',
        ns: 'translation',
        nsseparator: ':',
        keyseparator: '.',
        
        resGetPath: 'locales/__lng__/__ns__.json',
        resPostPath: 'locales/add/__lng__/__ns__',

        resStore: false,

        dynamicLoad: false,
        sendMissing: false,

        interpolationPrefix: '__',
        interpolationSuffix: '__',
        reusePrefix: '$t(',
        reuseSuffix: ')',
        pluralSuffix: '_plural',
        pluralNotFound: ['plural_not_found', Math.random()].join(''),
        setJqueryExt: true
    };

    var resStore = false
      , currentLng = false
      , replacementCounter = 0
      , languages = [];

    function init(options, cb){
        $.extend(o,options);

        // namespace
        if (typeof o.ns == 'string') {
            o.ns = { namespaces: [o.namespace], defaultNs: o.namespace};
        }

        if(!o.lng) { o.lng = detectLanguage(); }
        currentLng = o.lng;
        languages.push(currentLng);
        if (currentLng.length === 5) { languages.push(currentLng.substr(0, 2)); }
        languages.push(o.fallbackLng);

        fetch(o.lng, o.ns, o.dynamicLoad, function(err) {
            if (o.setJqueryExt) addJqueryFunct();

            if (cb) cb(translate);
        });
    }

    function addJqueryFunct() {
        $.t = $.t || translate;

        $.fn.i18n = function (options) {
            return this.each(function () {

                var elements =  $(this).find('[data-i18n]');
                elements.each(function () {
                    var ele = $(this)
                      , key = ele.attr('data-i18n')
                      , val = ele.text();

                    $(this).text($.t(key, { defaultValue: val }));
                });
            });
        };
    }

    function applyReplacement(string,replacementHash){
        $.each(replacementHash,function(key,value){
            string = string.replace([o.interpolationPrefix,key,o.interpolationSuffix].join(''),value);
        });
        return string;
    }

    function applyReuse(translated,options){
        while (translated.indexOf(o.reusePrefix) != -1){
            replacementCounter++;
            if(replacementCounter > o.maxRecursion){break;} // safety net for too much recursion
            var index_of_opening = translated.indexOf(o.reusePrefix);
            var index_of_end_of_closing = translated.indexOf(o.reuseSuffix,index_of_opening) + o.reuseSuffix.length;
            var token = translated.substring(index_of_opening,index_of_end_of_closing);
            var token_sans_symbols = token.replace(o.reusePrefix,"").replace(o.reuseSuffix,"");
            var translated_token = _translate(token_sans_symbols,options);
            translated = translated.replace(token,translated_token);
        }
        return translated;
    }

    function detectLanguage() {
        if (navigator) {
            return (navigator.language) ? navigator.language : navigator.userLanguage;
        } else {
            return o.fallbackLng;
        }
    }

    function needsPlural(options){
        return (options.count && typeof options.count != 'string' && options.count > 1);
    }

    function translate(key, options){
        replacementCounter = 0;
        return _translate(key, options);
    }

    /*
    options.defaultValue
    options.count
    */
    function _translate(key, options){
        options = options || {};
        var notfound = options.defaultValue || key;

        if (!resStore) { return notfound; } // No resStore to translate from

        var ns = o.ns.defaultNs;
        if (key.indexOf(o.nsseparator) > -1) {
            var parts = key.split(o.nsseparator);
            ns = parts[0];
            key = parts[1];
        }

        if (needsPlural(options)) {
            var optionsSansCount = $.extend({},options);
            delete optionsSansCount.count;
            optionsSansCount.defaultValue = o.pluralNotFound;
            var pluralKey = key + o.pluralSuffix;
            var translated = translate(pluralKey,optionsSansCount);
            if (translated != o.pluralNotFound) {
                return applyReplacement(translated,{count:options.count});//apply replacement for count only
            }// else continue translation with original/singular key
        }

        var found;
        for (i = 0, len = languages.length; i < len; i++ ) {
            if (found) break;

            var l = languages[i];

            var keys = key.split(o.keyseparator);
            var x = 0;
            var value = resStore[l][ns];
            while (keys[x]) {
                value = value && value[keys[x]];
                x++;
            }
            if (value) {
                value = applyReplacement(value, options);
                value = applyReuse(value, options);
                found = value;
            }
        }

        if (!found && o.sendMissing) {

            var payload = {};
            payload[key] = notfound;

            $.ajax({
                url: applyReplacement(o.resPostPath, {lng: o.fallbackLng, ns: ns}),
                type: 'POST',
                data: payload,
                success: function(data, status, xhr) {
                    resStore[o.fallbackLng][ns][key] = notfound;
                },
                error : function(xhr, status, error) {},
                dataType: "json"
            });
        }

        return (found) ? found : notfound;
    }

    function fetch(lng, ns, dynamicLoad, cb) {
        if (o.resStore) {
            resStore = o.resStore;
            cb(null);
            return;
        }
        
        if (!dynamicLoad) {

            resStore = {};

            var todo = ns.namespaces.length * languages.length;

            // load each file individual
            $.each(ns.namespaces, function(nsIndex, nsValue) {
                $.each(languages, function(lngIndex, lngValue) {
                    fetchOne(lngValue, nsValue, function(err) { 
                        todo--; // wait for all done befor callback
                        if (todo === 0) cb(null);
                    });
                });
            });


        } else {

            // load all needed stuff once
            $.ajax({
                url: applyReplacement(o.resGetPath, {lng: languages.join('+'), ns: ns.namespaces.join('+')}),
                success: function(data,status,xhr){
                    resStore = data;
                    cb(null);
                },
                error : function(xhr,status,error){
                    cb('failed loading resource.json error: ' + error);
                },
                dataType: "json"
            });
            
        }
    }

    function fetchOne(lng, ns, done){
        $.ajax({
            url: applyReplacement(o.resGetPath, {lng: lng, ns: ns}),
            success: function(data,status,xhr){

                if (!resStore[lng]) resStore[lng] = {};
                if (!resStore[lng][ns]) resStore[lng][ns] = {};

                resStore[lng][ns] = data;
                done(null);
            },
            error : function(xhr,status,error){
                if (!resStore[lng]) resStore[lng] = {};
                if (!resStore[lng][ns]) resStore[lng][ns] = {};

                resStore[lng][ns] = {};
                done(null);
            },
            dataType: "json"
        });
    }

    function lng() {
        return currentLng;
    }

    $.i18n = $.i18n || {
        init: init,
        t: translate,
        translate: translate,
        detectLanguage: detectLanguage,
        lng: lng
    };
})(jQuery);