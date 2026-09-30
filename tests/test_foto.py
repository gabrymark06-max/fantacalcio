from fanta_ai.scraping.foto import abbina, cognome_corrisponde, cognome_e_iniziali, norm


def test_norm_lettere_speciali():
    assert norm("Rasmus Højlund") == "rasmus hojlund"
    assert norm("Kenan Yıldız") == "kenan yildiz"
    assert norm("Nicolás Paz") == "nicolas paz"


def test_cognome_mai_come_nome_di_battesimo():
    assert cognome_corrisponde("pellegrino", "matias pellegrino")
    assert not cognome_corrisponde("pellegrino", "pellegrino albanese")
    assert cognome_corrisponde("paz", "nico paz martinez")
    assert cognome_corrisponde("wesley", "wesley")
    assert cognome_corrisponde("de ketelaere", "charles de ketelaere")


def test_iniziali_e_abbinamento_per_squadra():
    assert cognome_e_iniziali("Esposito F.P.") == ("esposito", ["f", "p"])
    giocatori = {
        "Q1": {"qid": "Q1", "n": "lautaro martinez", "attuali": {"Inter"}, "tutti": {"Inter"}},
        "Q2": {"qid": "Q2", "n": "josep martinez", "attuali": {"Inter"}, "tutti": {"Inter", "Genoa"}},
        "Q3": {"qid": "Q3", "n": "lisandro martinez", "attuali": set(), "tutti": set()},
    }
    assert abbina("Martinez L.", "Inter", giocatori)["qid"] == "Q1"
    assert abbina("Martinez Jo.", "Inter", giocatori)["qid"] == "Q2"
    # senza iniziale e con due Martinez in squadra: nessuna foto invece di quella sbagliata
    assert abbina("Martinez", "Inter", giocatori) is None


def test_anagrafica_dalla_pagina_del_giocatore():
    from fanta_ai.scraping.anagrafica import parse_anagrafica, slug

    pagina = (
        "<title>Mile Svilar - Profilo calciatore 2026/27 | Fantacalcio</title>"
        "<span>Altezza 189cm</span><span>Nato il 27 ago 1999</span><span>Piede Dx</span>"
    )
    assert parse_anagrafica(pagina) == ("Mile Svilar", "1999-08-27")
    assert parse_anagrafica("<title>X</title>") == (None, None)
    assert slug("Martinez L.") == "martinez-l"


def test_somiglianza_nome_completo_e_cognome():
    from fanta_ai.scraping.foto import somiglianza

    assert somiglianza("Mile Svilar", "svilar", "mile svilar") == 2
    assert somiglianza("Mile Svilar", "svilar", "marko svilar") == 1
    # stessa data di nascita ma cognome diverso: non è lui
    assert somiglianza("Mile Svilar", "svilar", "mile petrovic") == 0
    assert somiglianza("Lautaro Martinez", "martinez", "lautaro martinez") == 2
