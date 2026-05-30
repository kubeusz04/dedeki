// ===== Losowe tabele MG (szybkie inspiracje przy stole) =====
const DndRandomTables = {
  TABLES: {
    'Pogoda': [
      '☀️ Słonecznie i ciepło', '⛅ Pochmurno', '🌧️ Ulewny deszcz', '⛈️ Burza z piorunami',
      '🌫️ Gęsta mgła', '❄️ Śnieżyca', '🌪️ Silny wiatr', '🌤️ Przyjemna pogoda',
      '🌡️ Upał — testy KON', '🌧️ Mżawka przez cały dzień', '🌨️ Grad', '🌑 Zaćmienie — niepokój wśród NPC'
    ],
    'Napotkane NPC': [
      'Wędrowny kupiec z dziwnym towarem', 'Zagubiony podróżnik proszący o eskortę',
      'Patrol straży miejskiej', 'Banda rozbójników na muszce', 'Pielgrzym w drodze do świątyni',
      'Wędrowny bard z plotką', 'Łowca nagród szukający celu', 'Tajemniczy czarodziej w kapturze',
      'Uciekający więzień', 'Dziecko z mapą narysowaną węglem', 'Kontakt z gildii złodziei',
      'Kapłan proszący o pomoc przy rytuale'
    ],
    'Komplikacja w lochu': [
      'Pułapka! (wybierz DC)', 'Zawalony tunel — trzeba rozkopać', 'Tajne przejście za bookshelfem',
      'Zagadka na drzwiach', 'Trujący gaz — testy KON co rundę', 'Zalany korytarz — pływanie',
      'Rywalizujący poszukiwacze skarbów', 'Przeklęty skarb budzi nieumarłych',
      'Śluz pochłaniający buty', 'Magiczna cisza — zaklęcia nie działają 1 min',
      'Iluzja pokazuje fałszywą ścianę', 'Alarm — strażnicy za 1k6 rund'
    ],
    'Nastrój w tawernie': [
      'Głośna i radosna', 'Cicha i podejrzana', 'Pijacka bójka w trakcie',
      'Dziwny bard gra balladę o bohaterach', 'Plotki o smoku w okolicy',
      'Turniej pokera w tylnej sali', 'Tajemniczy nieznajomy w kącie',
      'Zamknięta — zaraza / kwarantanna', 'Święto żniw — taniec i pieśni',
      'Żałoba po zaginionym burmistrzu', 'Gildia kupców negocjuje cła'
    ],
    'Plotka / rumor': [
      'Smok przebudził się w górach', 'Książę zniknął podczas polowania',
      'W lesie pojawił się portal', 'Kult czci pod miastem',
      'Złoto w kopalni — ale kopalnia przeklęta', 'Bunt chłopów na wsi',
      'Elficki posel przybył do dworu', 'Morowe ogniska na pustkowiu',
      'Kradzież relikwii ze świątyni', 'Smoczy łotrzyk szuka partnerów'
    ],
    'Spotkanie w drodze': [
      'Konwój kupców prosi o ochronę', 'Ranny wojownik przy drodze',
      'Stado dzikich zwierząt', 'Most zawalony — objazd przez bagno',
      'Znak drogowy w obcym języku', 'Pojedyncza trumna na poboczu',
      'Dym z pożaru w oddali', 'Żebrak z proroctwem', 'Deserterzy z armii',
      'Karawana uchodźców'
    ],
    'Zdarzenie w mieście': [
      'Pożar w dzielnicy rzemieślników', 'Parada lorda', 'Aukcja niewolnika / służącego',
      'Egzekucja na rynku', 'Festiwal świateł', 'Zamknięte kanały — szczury',
      'Kradzież w sklepie gracza', 'Nowy podatek — zamieszki', 'Wróżbita na rynku',
      'Zaginięcie dziecka szlachcica'
    ],
    'Pułapka (pomysł)': [
      'Kolczatka ukryta pod mchem', 'Magiczna runa na podłodze (DEX save)',
      'Spadające kamienne drzwi', 'Zatrute sztylety na skrzyni',
      'Lustro teleportujące w pułapkę', 'Fałszywa skrzynia — jadowity gaz',
      'Iluzja bezpiecznej ścieżki', 'Klinka w ścianie strzela bełtem',
      'Woda zalewa pomieszczenie', 'Zombie w skrzyni na łańcuchu'
    ],
    'Skarb (oprócz monet)': [
      'Magiczny sztylet +1', 'Eliksir leczenia', 'Mapa do ukrytej komnaty',
      'Klejnot bez oprawy', 'Starożytna moneta kolekcjonerska', 'Zwój z jednym zaklęciem',
      'Pierścień z herbem nieznanej rodziny', 'Srebrny medalion z portretem',
      'Klucz z etykietą „nie otwierać”', 'Pergamin z przepisem alchemicznym',
      'Tarcza z herbem miasta', 'Amulet ochrony przed zimnem'
    ],
    'Losowy przeciwnik (spotkanie)': [
      '2d4 goblinów', '1 owlbear', 'Banda 3 bandytów', 'Szkieletów 1k4',
      'Młody wyverna (ucieka po połowie HP)', 'Cultysta + 2 thugów', 'Duch opętujący drzewo',
      'Roj szczurów', 'Niedźwiedź', 'Patrol orków', 'Mglisty szkieletowy rycerz'
    ],
    'Nagroda / zapłata': [
      '100 złota z góry', 'Przepustka do strefy zastrzeżonej',
      'Informacja o ukrytej ścieżce', 'Usługa kowala (naprawa)', 'Błogosławieństwo kapłana',
      'Potion za darmo', 'Rumors bez opłaty', 'Konie na tydzień',
      'Posążek wartości sentymentalnej', 'List polecający do gildii'
    ],
    'Komplikacja społeczna': [
      'NPC kłamie o swojej tożsamości', 'Dwa frakcje proszą o tę samą przysługę',
      'Ktoś rozpoznaje gracza z przeszłości', 'Fałszywy areszt przez straż',
      'Zakaz magii w mieście', 'Gracz jest podejrzany o morderstwo',
      'Romans NPC komplikuje quest', 'Przekupstwo tylko drogą magiczną'
    ],
    'Środowisko / teren': [
      'Błotnisty teren — połowa prędkości', 'Lawa / gorące źródła',
      'Lodowa ścieżka — testy ZRĘ', 'Gęsty las — ograniczona widoczność',
      'Ruiny zawalają się losowo', 'Mgła — 3 m widzenia',
      'Silny wiatr — testy STR na latanie', 'Święta polana — bonus do leczenia'
    ],
    'Sen / wizja': [
      'Proroczy sen o smokach', 'Ostrzeżenie od przodka', 'Zagubiona postać z przeszłości',
      'Symbol powtarzający się w snach', 'Głos bogini / demona', 'Mapa widziana we śnie',
      'Koszmar — jedna frakcja strachu', 'Sen o upadku miasta'
    ],
    'Tawerna — specjalne danie': [
      'Gulasz z nieznanego mięsa', 'Pierogi szczęścia (+1 na następny test)',
      'Miód pitny — testy CHA z przewagą', 'Zupa zbyt ostra — KON save',
      'Deser z magicznym świeceniem', 'Piwo, które zmienia kolor włosów',
      'Dania dnia: „Co kucharka znalazła”'
    ],
    'Podróż — opóźnienie': [
      'Zepsuty wóz', 'Most w remoncie', 'Kontrola straży — przeszukanie',
      'Ulewa — obóz w błocie', 'Zgubiona mapa', 'Kucyk zachorował',
      'Troll na drodze (negocjacje?)', 'Śluz zalewa obóz w nocy'
    ],
    'NPC — dziwactwo': [
      'Mówi tylko rymami', 'Kolekcjonuje paznokcie', 'Boi się własnego cienia',
      'Wierzy, że jest smokiem w ludzkiej skórze', 'Rysuje mapy na piasku',
      'Nigdy nie mruga', 'Pachnie deszczem nawet w piwnicy'
    ],
    'Klątwa / przekleństwo': [
      'Przedmiot woła w nocy', 'Włosy bielą po jednej nocy', 'NPC nie może kłamać',
      'Każde zaklęcie ma 5% fumble', 'Cień nie pasuje do ciała', 'Zawsze chłód — brak ognia'
    ],
    'Religia / kult': [
      'Pielgrzymka blokuje drogę', 'Święty dzień — zakaz przemocy',
      'Nowy kult w piwnicy', 'Relikwia wymaga ofiary krwi', 'Dzwony biją bez powodu',
      'Kapłan szuka heretyka'
    ],
    'Morze / rzeka': [
      'Sztorm — testy żeglugi', 'Piraci na horyzoncie', 'Syrena śpiewa',
      'Ciało wypływa przy brzegu', 'Mgła na wodzie', 'Most rzeczny — opłata podwójna'
    ],
    'Podziemia — atmosfera': [
      'Krople wody co turę — nerwy', 'Echo kroków za party', 'Zapach siarki',
      'Światło pochodni gaśnie łatwiej', 'Głos śpiewu z głębi', 'Ślady śluzu świeże'
    ],
    'Magia — efekt uboczny': [
      'Iskry z dłoni po czarze', 'Włosy stają dęba na minutę', 'Zaklęcie zmienia kolor',
      'Tymczasowy zapach pieczonego chleba', 'Dzwonek w uszach', 'Iluzja motyla'
    ],
    'Quest hook (szybki)': [
      'List bez nadawcy', 'Nagroda na tablicy', 'Prośba dziecka',
      'Zaginiona księga w bibliotece', 'Bestia niszczy farmy', 'Duch prosi o pomstę',
      'Turniej z pulą nagród', 'Kradzież w muzeum gildii'
    ]
  }
};
