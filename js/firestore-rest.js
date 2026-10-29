/* Anonymous sign-in and a Firestore read without the three Firebase compat SDKs (150 kB) and the auth iframe
   (93 kB) the browser used to download before it could paint a tile. Each is one HTTPS call. Used by 404.html
   (the shared-link solver) and /today. The mini app keeps the SDK: it writes as well as reads.

   A plain script rather than a module, because both pages are plain scripts too. It defines PhuzzlesDB. */
(function (root) {
  "use strict";

  // The web API key names the project and is public by design; firestore.rules is what guards the data.
  var KEY = "AIzaSyDPn4eEkZhUBp7x_3mVVcDlaiopfFDJna4";
  var DOCS = "https://firestore.googleapis.com/v1/projects/phuzzles/databases/(default)/documents";
  // Where this browser's anonymous identity is kept, so /today and the solver share one sign-in.
  var SAVED = "phz:anon";

  function json(url, opts) {
    return fetch(url, opts).then(function (r) {
      return r.text().then(function (t) {
        var body = null;
        try { body = JSON.parse(t); } catch (e) {}
        return { status: r.status, ok: r.ok, body: body };
      });
    });
  }
  function saved() { try { return JSON.parse(localStorage.getItem(SAVED)); } catch (e) { return null; } }
  function keep(t) { try { localStorage.setItem(SAVED, JSON.stringify(t)); } catch (e) {} return t; }

  // Firebase stops signing in new visitors from one address after a burst of them, and an office, a campus or
  // a phone carrier puts many people behind one address, so that case gets its own code for the page to word.
  function signUp() {
    return json("https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=" + KEY,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ returnSecureToken: true }) })
      .then(function (r) {
        var why = (r.body && r.body.error && r.body.error.message) || "";
        if (!r.ok || !r.body.idToken) throw { code: /TOO_MANY/.test(why) ? "auth/too-many-requests" : "auth/failed" };
        return keep({ id: r.body.idToken, refresh: r.body.refreshToken,
                      exp: Date.now() + (+r.body.expiresIn || 3600) * 1000 }).id;
      });
  }
  // Reuse this browser's anonymous identity while the token lasts, refresh it when it doesn't, mint one when
  // there is none. The SDK kept one in IndexedDB; without this, every hour would have been a new anonymous user.
  function token(fresh) {
    var t = saved();
    if (!fresh && t && t.id && t.exp > Date.now() + 60000) return Promise.resolve(t.id);
    if (!t || !t.refresh) return signUp();
    return json("https://securetoken.googleapis.com/v1/token?key=" + KEY,
      { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ grant_type: "refresh_token", refresh_token: t.refresh }) })
      .then(function (r) {
        if (!r.ok || !r.body || !r.body.id_token) return signUp();
        return keep({ id: r.body.id_token, refresh: r.body.refresh_token,
                      exp: Date.now() + (+r.body.expires_in || 3600) * 1000 }).id;
      });
  }

  // Firestore's REST shape is { fields: { title: { stringValue: "…" } } }. A timestamp keeps a toMillis()
  // because that is what the SDK handed isTodaysDaily. A reference, a geopoint and bytes never appear on a
  // puzzle, so they read as null rather than carrying a decoder nothing calls.
  function value(v) {
    if (!v || typeof v !== "object") return null;
    if ("stringValue" in v) return v.stringValue;
    if ("booleanValue" in v) return v.booleanValue;
    if ("integerValue" in v) return +v.integerValue;
    if ("doubleValue" in v) return +v.doubleValue;
    if ("timestampValue" in v) { var ms = Date.parse(v.timestampValue); return { toMillis: function () { return ms; } }; }
    if ("mapValue" in v) return fields(v.mapValue && v.mapValue.fields);
    if ("arrayValue" in v) return ((v.arrayValue && v.arrayValue.values) || []).map(value);
    return null;   // nullValue, and anything a puzzle document doesn't carry
  }
  function fields(f) {
    var o = {};
    for (var k in f) if (Object.prototype.hasOwnProperty.call(f, k)) o[k] = value(f[k]);
    return o;
  }

  function call(url, tok, body) {
    var o = { headers: { Authorization: "Bearer " + tok } };
    if (body) { o.method = "POST"; o.headers["content-type"] = "application/json"; o.body = JSON.stringify(body); }
    return json(url, o);
  }
  // A token this browser saved can have been revoked or outlived its refresh, which reads as 401: one retry.
  function send(url, body) {
    return token(false)
      .then(function (tok) { return call(url, tok, body); })
      .then(function (r) { return r.status !== 401 ? r : token(true).then(function (tok) { return call(url, tok, body); }); });
  }

  /**
   * One document, e.g. get("puzzles/" + id). Resolves { status, data }, data only on 200.
   *
   * The rules read the document's own fields, so a puzzle only its recipient may open, a deleted one and one
   * that never existed all come back 403. A caller that needs to tell them apart cannot, and none does.
   */
  function get(path) {
    return send(DOCS + "/" + path).then(function (r) {
      return { status: r.status, data: r.status === 200 ? fields(r.body && r.body.fields) : null };
    });
  }

  /** A structured query, e.g. the isPotd one /today runs. Resolves a list of { id, data }. */
  function query(structuredQuery) {
    return send(DOCS + ":runQuery", { structuredQuery: structuredQuery }).then(function (r) {
      if (r.status !== 200 || !(r.body instanceof Array)) throw { code: "query/" + r.status };
      return r.body.filter(function (x) { return x.document; }).map(function (x) {
        return { id: x.document.name.split("/").pop(), data: fields(x.document.fields) };
      });
    });
  }

  root.PhuzzlesDB = { get: get, query: query };
})(window);
