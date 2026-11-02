# For the Love of Food: Research Notes (v0)

Status: first pass written from background knowledge. Nothing here has been checked against live sources yet. Items marked **(verify)** need confirming before we rely on them, especially licences and API limits.

## 1. Product scope

| Pillar | What it is |
|---|---|
| Places | Countries, with sub-national regions where the cuisine really differs |
| Dishes | The core entity, with story, ingredients, tags and recipes |
| Recipes | One or more versions per dish: traditional, home, quick |
| Festivals | Food festivals and festival-linked dishes, with dates and places |
| Discovery | Faceted filtering across all of the above |

## 2. Countries with strongly regional cuisine

Rule for inclusion: regions have distinct staple ingredients, techniques or signature dishes, not just different names. Suggested seed set (about 12 countries, 4 to 8 regions each), picked for breadth and for how well each is documented.

| Country | Regional split (examples) | Why it varies |
|---|---|---|
| India | North (Punjab, Kashmir), South (Tamil Nadu, Kerala, Andhra), East (Bengal, Odisha), West (Gujarat, Maharashtra, Goa), North-East | Climate, religion, staple grain (wheat vs rice), coastal vs inland |
| China | Eight Great Cuisines: Sichuan, Cantonese, Shandong, Jiangsu, Zhejiang, Fujian, Hunan, Anhui | Geography, technique (steaming, stir-fry, braising) |
| Italy | Piedmont, Lombardy, Emilia-Romagna, Tuscany, Lazio, Campania, Sicily, Puglia | Butter vs olive oil, fresh vs dried pasta, late national unification |
| France | Alsace, Provence, Brittany, Lyon/Burgundy, Normandy, South-West | Terroir, dairy and wine geography |
| Spain | Basque Country, Catalonia, Andalusia, Galicia, Valencia | Coast vs interior, Moorish influence |
| Mexico | Oaxaca, Yucatan, Puebla, Veracruz, Baja, Jalisco | Indigenous bases, mole families, Maya and Spanish mix |
| Japan | Hokkaido, Kansai, Kanto, Kyushu, Okinawa | Dashi style, noodles, local seafood |
| Thailand | Central, North (Lanna), Isan (North-East), South | Sticky vs jasmine rice, coconut, spice level |
| Vietnam | North (Hanoi), Central (Hue), South (Saigon) | Subtle and salty vs spicy vs sweet |
| USA | Southern, Creole/Cajun, Tex-Mex, New England, Pacific Northwest, Midwest | Immigration waves, local produce |
| Turkey | Aegean, Black Sea, South-East (Gaziantep), Central Anatolia | Olive oil vs butter, kebab culture |
| Nigeria / West Africa | Yoruba, Igbo, Hausa regions | Staples (yam, cassava, millet), soups |

Later candidates: Germany, Brazil, Peru, Ethiopia, Morocco, Lebanon, Indonesia, Korea, Greece, UK.

## 3. Data model

```
Country (id, name, iso2, region_group, summary)
 └── Region (id, country_id, name, geo_summary, signature_ingredients[])
Dish (id, name, local_name, country_id, region_id?, type, course, story_md,
      origin_period, origin_claims[], flavours[], diet_tags[], cook_method[],
      spice_level 0-5, image, sources[])
Recipe (id, dish_id, title, version_label, servings, prep_min, cook_min,
        difficulty, ingredients[{ingredient_id, qty, unit, note}], steps[], notes, author, licence)
Ingredient (id, name, category, aliases[], allergens[])
Festival (id, name, country_id, region_id?, city, month/date rule, duration,
          type [harvest|religious|beverage|street-food|seasonal], origin_story_md, links[])
FestivalDish (festival_id, dish_id, role [traditional|signature|seasonal], note)
Source (id, title, url, type, accessed)
```

Design notes:
- A dish can belong to a country with no region, or to several festivals.
- Contested origins (e.g. pizza, hummus, pad thai) need `origin_claims[]` with citations rather than one confident story.
- Keep ingredient and tag vocabularies controlled lists so filters stay clean.

## 4. Filter facets

| Facet | Values (initial) |
|---|---|
| Country / region | from the Country and Region tables |
| Ingredient | include and exclude, multi-select, with aliases (aubergine = eggplant) |
| Flavour | sweet, sour, salty, bitter, umami, spicy, smoky, tangy, aromatic, rich |
| Dish type | soup, stew, curry, salad, bread, rice dish, noodle, dumpling, grill/BBQ, street food, dessert, drink, pickle/ferment, sauce |
| Course | breakfast, starter, main, side, dessert, snack, drink |
| Diet | vegetarian, vegan, gluten-free, halal, kosher-friendly, dairy-free, nut-free |
| Spice level | 0 to 5 |
| Time / difficulty | under 30 min, under 1 hr, longer; easy, medium, hard |
| Festival | festival, festival type, month of year |
| Cooking method | fried, steamed, baked, grilled, raw, fermented, slow-cooked |

Query behaviour: AND across facets, OR within one facet, plus free-text search over name, local name and aliases.

## 5. Festival catalogue (seed list)

Dishes grouped under each festival is the key differentiator. Dates are approximate; **(verify)** all of them.

| Festival | Where / when | Signature foods |
|---|---|---|
| Oktoberfest | Munich, Germany; late Sep to early Oct | Roast chicken (Hendl), pretzels, Weisswurst, Käsespätzle, Maß of festbier |
| Diwali | India and diaspora; Oct/Nov | Mithai: gulab jamun, laddu, barfi, chakli, karanji |
| Lunar New Year | China, Vietnam, Korea; Jan/Feb | Dumplings, nian gao, whole fish, spring rolls, tteokguk (Korea), bánh chưng (Vietnam) |
| Eid al-Fitr | Muslim world; after Ramadan | Sheer khurma, baklava, ma'amoul, biryani |
| Thanksgiving | USA / Canada; Nov / Oct | Roast turkey, cranberry sauce, pumpkin pie, stuffing |
| Day of the Dead | Mexico; 1 to 2 Nov | Pan de muerto, sugar skulls, tamales, atole |
| Songkran | Thailand; April | Khao chae, mango sticky rice |
| Pongal / Makar Sankranti | India; January | Sweet and savoury pongal, til laddu, chikki |
| La Tomatina | Buñol, Spain; August | Tomatoes (mostly thrown); paella is the local meal |
| Carnival | Brazil, Italy, Louisiana; Feb/Mar | Feijoada, frittelle/chiacchiere, king cake |
| Christmas (regional) | Global; December | Panettone, stollen, bûche de Noël, bibingka, tamales |
| Passover / Hanukkah | Jewish communities | Matzo, charoset; latkes, sufganiyot |
| Nowruz | Iran, Central Asia; March | Sabzi polo mahi, sabzeh, sumalak |
| Chuseok | Korea; Sep/Oct | Songpyeon, jeon, japchae |
| Gion Matsuri / Hanami | Japan; July / spring | Chimaki, hanami dango, sakura mochi |
| Festa Junina | Brazil; June | Canjica, pamonha, pé de moleque |
| Gilroy Garlic / Maine Lobster / Pizza festivals | Various | Single-ingredient festivals, good for the "street food / harvest" type |
| Beverage festivals | Beer (Oktoberfest, Czech), wine harvest (Vendimia, Italy), sake | Pair drinks with dishes |

Sources to build this list from: UNESCO Intangible Cultural Heritage list (several food traditions are on it, e.g. Neapolitan pizzaiuolo, Mediterranean diet, kimjang, washoku) **(verify)**, national tourism boards, Wikipedia "List of food festivals".

## 6. Content sources and licensing

| Source | Use | Licensing / risk |
|---|---|---|
| Wikipedia / Wikidata | Dish, region and festival facts, origin claims | CC BY-SA; share-alike affects our text if copied. Prefer writing our own summaries and citing |
| TheMealDB | Seed recipes | Free tier exists; commercial use and terms **(verify)** |
| Open Food Facts | Ingredient and nutrition taxonomy | ODbL; attribution and share-alike on the database |
| USDA FoodData Central | Nutrition | Public domain (US government) |
| UNESCO ICH | Heritage-listed food traditions | Cite only; summarise in our words |
| Cookbooks, blogs, news | Dish history | Copyrighted: take facts, never text. Recipes' ingredient lists are generally not copyrightable, but the written method often is |

Rule: all story and recipe text is original, with sources stored on each record. This avoids copyright and share-alike problems, and it lets us show where claims come from.

## 7. Decisions

| Question | Decision |
|---|---|
| Audience | All three: home cooks, travellers and culture readers |
| Content approach | AI-drafted, human-reviewed, with cited sources on every record |
| Stack | Static site (Astro or Next.js) reading Markdown/JSON, client-side filtering |
| Languages | English only; local dish names and scripts stored for later translation |
| User features | Read-only plus favourites saved in the visitor's browser (no accounts) |

## 8. Suggested next steps

1. Decisions above are made.
2. I turn the data model into JSON schemas and a content folder layout.
3. I seed 3 countries, with regions, about 5 dishes each, and 3 festivals as a vertical slice.
4. I build a minimal filterable prototype on that slice, then we expand content.
