// ==UserScript==
// @name         myFly Club Slacky
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  try to take over the world!
// @author       Slacktide (orinal scipt by Aphix/Torus & original cost per PAX by Alrianne)
// @match        https://*.myfly.club/
// @icon         https://www.google.com/s2/favicons?domain=myfly.club
// @grant        none
// ==/UserScript==


function reportAjaxError(jqXHR, textStatus, errorThrown) {
    console.error(JSON.stringify(jqXHR));
    console.error("AJAX error: " + textStatus + ' : ' + errorThrown);
    // throw errorThrown;
}

function _request(url, method = 'GET', data = undefined) {
    return new Promise((resolve, reject) => {
        $.ajax({
            url,
            type: method,
            contentType: 'application/json; charset=utf-8',
            data: data ? JSON.stringify(data) : data,
            dataType: 'json',
            success: resolve,
            error: (...args) => {
                reportAjaxError(...args);
                reject(...args);
            }
        })
    })
}


function _populateDerivedFieldsOnLink(link) {
    link.totalCapacity = link.capacity.economy + link.capacity.business + link.capacity.first
    link.totalCapacityHistory = link.capacityHistory.economy + link.capacityHistory.business + link.capacityHistory.first
    link.totalPassengers = link.passengers.economy + link.passengers.business + link.passengers.first
    link.totalLoadFactor = link.totalCapacityHistory > 0 ? Math.round(link.totalPassengers / link.totalCapacityHistory * 100) : 0
    var assignedModel
    if (link.assignedAirplanes && link.assignedAirplanes.length > 0) {
        assignedModel = link.assignedAirplanes[0].airplane.name
    } else {
        assignedModel = "-"
    }
    link.model = assignedModel //so this can be sorted

    link.profitMarginPercent = link.revenue === 0
        ? 0
    : ((link.profit + link.revenue) / link.revenue) * 100;

    link.profitMargin = link.profitMarginPercent > 100
        ? link.profitMarginPercent - 100
    : (100 - link.profitMarginPercent) * -1;

    link.profitPerPax = link.totalPassengers === 0
        ? 0
    :link.profit / link.totalPassengers;

    link.profitPerFlight = link.profit / link.frequency;
    link.profitPerHour = link.profit / link.duration;

    //console.dir(link);
}


function getShortModelName(airplaneName) {
    // Shorten airplane name to fit into smaller collumn
    var sections = airplaneName.trim().split(' ').slice(1);

    return sections
        .map(str => (str.includes('-')
                     || str.length < 4
                     || /^[A-Z0-9\-]+[a-z]{0,4}$/.test(str))
             ? str
             : str[0].toUpperCase())
        .join(' ');
}

function getStyleFromTier(tier) {
    const stylesFromGoodToBad = [
        'color:#29FF66;',
        'color:#5AB874;',
        'color:inherit;',

        'color:#FA8282;',
        //'color:#FF3D3D;',
        //'color:#B30E0E;text-shadow:0px 0px 2px #CCC;',

        'color:#FF6969;',
        'color:#FF3D3D;font-weight: bold;',
        // 'color:#FF3D3D;text-decoration:underline',
    ];

    return stylesFromGoodToBad[tier];
}

function getTierFromPercent(val, min = 0, max = 100) {
    // Get aggregate ranking
    var availableRange = max - min;
    var ranges = [
        .95,
        .80,
        .75,
        .6,
        .5
    ].map(multiplier => (availableRange * multiplier) + min);

    var tier;
    if (val > ranges[0]) {
        return 0;
    } else if (val > ranges[1]) {
        return 1;
    } else if (val > ranges[2]) {
        return 2;
    } else if (val > ranges[3]) {
        return 3;
    } else if (val > ranges[4]) {
        return 4;
    }

    return 5;
}


function _getPricesFor(link) {
    var linkPrices = {};
    for (var key in link.price) {
        if (key === 'total') continue;

        linkPrices[key] = link.price[key] - 5;
        // linkPrices[key] = link.price[key] - (_isFullPax(link, key) ? 0 : 5);
    }

    return linkPrices;
}



async function _updateLatestOilPriceInHeader() {
    const oilPrices = await _request('oil-prices');
    const latestPrice = oilPrices.slice(-1)[0].price;

    if (!$('.topBarDetails .latestOilPriceShortCut').length) {
        $('.topBarDetails .delegatesShortcut').after(`
            <span style="margin: 0px 10px; padding: 0 5px"  title="Latest Oil Price" class="latestOilPriceShortCut clickable" onclick="showOilCanvas()">
                <span class="latest-price label" style=""></span>
            </span>
        `);
    }



    const tierForPrice = 5 - getTierFromPercent(latestPrice, 40, 80);

    if (tierForPrice < 2) {
        $('.latestOilPriceShortCut')
            .addClass('glow')
            .addClass('button');
    } else {
        $('.latestOilPriceShortCut')
            .removeClass('glow')
            .removeClass('button');
    }

    $('.topBarDetails .latest-price')
        .text('$'+commaSeparateNumber(latestPrice))
        .attr({style: getStyleFromTier(tierForPrice)});

    setTimeout(() => {
        _updateLatestOilPriceInHeader();
    //}, Math.round(Math.max(cycleDurationEstimation / 2, 30000)));
    // Setting to 10 minutes
    }, 600000);
}

function commaSeparateNumberForLinks(val) {
    const over1k = val > 1000 || val < -1000;
    const isNegative = (val < 0);

    if (val !== 0) {
        const withDecimal = Math.abs(over1k ? val / 1000 : val);
        const remainderTenths = Math.round((withDecimal % 1) * 10) / 10;
        val = Math.floor(withDecimal) + remainderTenths;

        while (/(\d+)(\d{3})/.test(val.toString())) {
            val = val.toString().replace(/(\d+)(\d{3})/, '$1'+','+'$2');
        }
    }

    const valWithSuffix = over1k ? val + 'k' : val;

    return isNegative ? '(' + valWithSuffix + ')' : valWithSuffix;
}


function launch(){

    window.commaSeparateNumberForLinks = commaSeparateNumberForLinks;

    var cachedTotalsById = {};


    window.updateCustomLinkTableHeader = function updateCustomLinkTableHeader() {
        if ($('#linksTableSortHeader').children().length === 15) {
            return;
        }

        $('#linksCanvas .mainPanel').css({width: '62%'});
        $('#linksCanvas .sidePanel').css({width: '38%'});

        /* Unnecessary
        $('#canvas .mainPanel').css({width: '62%'});
        $('#canvas .sidePanel').css({width: '38%'});
        */

        const widths = [
            /*
            8,
            8,
            8,
            7,
            9,
            8,
            5,
            5,
            9,
            8,
            6,
            6,
            7,
            7,
            2, //tiers, 1st
            */
            8,
            8,
            8,
            7,
            9,
            5,
            5,
            5,
            9,
            8,
            6,
            6,
            7,
            7,
            2, //tiers, 1st
        ];

        const sum = widths.reduce((acc, val) => acc + val, 0);
        if (sum !== 100) {
            console.warn(`Column widths to not add up to 100: ${sum} (${widths.join(',')}) -- ${sum < 100 ? 'Remaining' : 'Over by'}: ${sum < 100 ? 100 - sum : sum - 100}%`)
        }

        $('#linksTableSortHeader').html(`
            <div class="cell clickable" style="width: ${widths[14]}%" data-sort-property="tiersRank" data-sort-order="descending" onclick="toggleLinksTableSortOrder($(this))" title="Aggregated Rank" id="tiersRank">#</div>
            <div class="cell clickable" style="width: ${widths[0]}%" data-sort-property="fromAirportCode" data-sort-order="descending" onclick="toggleLinksTableSortOrder($(this))">From</div>
            <div class="cell clickable" style="width: 0%" data-sort-property="lastUpdate" data-sort-order="ascending" id="hiddenLinkSortBy"></div> <!--hidden column for last update (cannot be first otherwise the left round corner would not work -->
            <div class="cell clickable" style="width: ${widths[1]}%" data-sort-property="toAirportCode" data-sort-order="descending" onclick="toggleLinksTableSortOrder($(this))">To</div>
            <div class="cell clickable" style="width: ${widths[2]}%" data-sort-property="model" data-sort-order="ascending" onclick="toggleLinksTableSortOrder($(this))">Model</div>
            <div class="cell clickable" style="width: ${widths[3]}%" align="right" data-sort-property="distance" data-sort-order="ascending" onclick="toggleLinksTableSortOrder($(this))">Dist.</div>
            <div class="cell clickable" style="width: ${widths[4]}%" align="right" data-sort-property="totalCapacity" data-sort-order="ascending" onclick="toggleLinksTableSortOrder($(this))">Capacity (Freq.)</div>
            <div class="cell clickable" style="width: ${widths[5]}%" align="right" data-sort-property="totalPassengers" data-sort-order="ascending" onclick="toggleLinksTableSortOrder($(this))">Pax</div>
            <div class="cell clickable" style="width: ${widths[6]}%" align="right" data-sort-property="totalLoadFactor" data-sort-order="ascending" onclick="toggleLinksTableSortOrder($(this))" title="Load Factor">LF</div>
            <div class="cell clickable" style="width: ${widths[7]}%" align="right" data-sort-property="satisfaction" data-sort-order="ascending" onclick="toggleLinksTableSortOrder($(this))" title="Satisfaction Factor">SF</div>
            <div class="cell clickable" style="width: ${widths[8]}%" align="right" data-sort-property="revenue" data-sort-order="ascending" onclick="toggleLinksTableSortOrder($(this))">Revenue</div>
            <div class="cell clickable" style="width: ${widths[9]}%" align="right" data-sort-property="profit" data-sort-order="descending" onclick="toggleLinksTableSortOrder($(this))">Profit</div>
            <div class="cell clickable" style="width: ${widths[10]}%" align="right" data-sort-property="profitMargin" data-sort-order="ascending" onclick="toggleLinksTableSortOrder($(this))">Gain</div>
            <div class="cell clickable" style="width: ${widths[11]}%" align="right" data-sort-property="profitPerPax" data-sort-order="ascending" onclick="toggleLinksTableSortOrder($(this))">$/🧍</div>
            <div class="cell clickable" style="width: ${widths[12]}%" align="right" data-sort-property="profitPerFlight" data-sort-order="ascending" onclick="toggleLinksTableSortOrder($(this))">$/✈</div>
            <div class="cell clickable" style="width: ${widths[13]}%" align="right" data-sort-property="profitPerHour" data-sort-order="ascending" onclick="toggleLinksTableSortOrder($(this))">$/⏲</div>
        `);

        $('#linksTableFilterHeader').html(`
            <div class="cell" style="width: ${widths[14]}%">&nbsp;</div>
            <div class="cell" style="width: ${widths[0]}%" data-filter-property="fromAirportCode">&nbsp;</div>
            <div class="cell" style="width: 0%"></div>
            <div class="cell cell" style="width: ${widths[1]}%" data-sort-property="toAirportCode">&nbsp;</div>
            <div class="cell" style="width: ${widths[2]}%" data-filter-property="modelId"> </div>
            <div class="cell" style="width: ${widths[3]}%">&nbsp;</div>
            <div class="cell" style="width: ${widths[4]}%">&nbsp;</div>
            <div class="cell" style="width: ${widths[5]}%">&nbsp;</div>
            <div class="cell" style="width: ${widths[6]}%">&nbsp;</div>
            <div class="cell" style="width: ${widths[7]}%">&nbsp;</div>
            <div class="cell" style="width: ${widths[8]}%">&nbsp;</div>
            <div class="cell" style="width: ${widths[9]}%">&nbsp;</div>
            <div class="cell" style="width: ${widths[10]}%">&nbsp;</div>
            <div class="cell" style="width: ${widths[11]}%">&nbsp;</div>
            <div class="cell" style="width: ${widths[12]}%">&nbsp;</div>
            <div class="cell" style="width: ${widths[13]}%">&nbsp;</div>

        `);


        $('#linksTable .table-header').html(`
            <div class="cell" style="width: ${widths[14]}%; border-bottom: none;"></div>
            <div class="cell" style="width: ${widths[0]}%; border-bottom: none;"></div>
            <div class="cell" style="width: ${widths[1]}%; border-bottom: none;"></div>
            <div class="cell" style="width: ${widths[2]}%; border-bottom: none;"></div>
            <div class="cell" style="width: ${widths[3]}%; border-bottom: none;"></div>
            <div class="cell" style="width: ${widths[4]}%; border-bottom: none;"></div>
            <div class="cell" style="width: ${widths[5]}%; border-bottom: none;"></div>
            <div class="cell" style="width: ${widths[6]}%; border-bottom: none;"></div>
            <div class="cell" style="width: ${widths[7]}%; border-bottom: none;"></div>
            <div class="cell" style="width: ${widths[8]}%; border-bottom: none;"></div>
            <div class="cell" style="width: ${widths[9]}%; border-bottom: none;"></div>
            <div class="cell" style="width: ${widths[10]}%; border-bottom: none;"></div>
            <div class="cell" style="width: ${widths[11]}%; border-bottom: none;"></div>
            <div class="cell" style="width: ${widths[12]}%; border-bottom: none;"></div>
            <div class="cell" style="width: ${widths[13]}%; border-bottom: none;"></div>
        `);
    }


    window.loadLinksTable = async function loadLinksTable() {
        const links = await _request(`airlines/${activeAirline.id}/links-details`);

        updateCustomLinkTableHeader();
        updateLoadedLinks(links);
        updateLinksColumnFilterOptions(links);

        $.each(links, (key, link) => _populateDerivedFieldsOnLink(link));

        var selectedSortHeader = $('#linksTableSortHeader .cell.selected')
        updateLinksTable(selectedSortHeader.data('sort-property'), selectedSortHeader.data('sort-order'))

        // Sort on #tiersRank by default when window is loaded
        toggleLinksTableSortOrder($('#tiersRank'));
    }






        let showFilterRowState = 0;
        function toggleLinksTableFilterRow() {
            const header = $("#linksTableFilterHeader");
            switch (showFilterRowState) {
                case 0:
                    header.show();
                    header.css("height", "200px");
                    showFilterRowState = 1;
                    break;
                case 1:
                    header.show();
                    header.css("height", "600px");
                    showFilterRowState = 2;
                    break;
                default:
                    header.hide();
                    header.css("height", "200px");
                    showFilterRowState = 0;
            }
        }







    var colorKeyMaps = {};
    window.updateLinksTable = function updateLinksTable(sortProperty, sortOrder) {
        var linksTable = $("#linksCanvas #linksTable")
        linksTable.children("div.table-row").remove()

        loadedLinks = sortPreserveOrder(loadedLinks, sortProperty, sortOrder == "ascending")

        function getKeyedStyleFromLink(link, keyName, ...args) {
            if (!colorKeyMaps[keyName]) {
                colorKeyMaps[keyName] = new WeakMap();
            } else if (colorKeyMaps[keyName].has(link)) {
                return colorKeyMaps[keyName].get(link);
            }

            var data = loadedLinks.map(l => l[keyName]);

            var avg = data.reduce((sum, acc) => sum += acc, 0) / loadedLinks.length;
            var max = Math.max(...data);
            var min = Math.max(Math.min(...data), 0);

            var tier = getTierFromPercent(link[keyName], args[0] !== undefined ? args[0] : min, args[1] || (avg * .618));
            if (!link.tiers) {
                link.tiers = {};
            }

            link.tiers[keyName] = tier;

            var colorResult = getStyleFromTier(tier);

            colorKeyMaps[keyName].set(link, colorResult);

            return colorResult;
        }

        $.each(loadedLinks, function(index, link) {
            var row = $("<div class='table-row clickable' onclick='selectLinkFromTable($(this), " + link.id + ")'></div>")

            var srcAirportFull = getAirportText(link.fromAirportCity, link.fromAirportCode);
            var destAirportFull = getAirportText(link.toAirportCity, link.toAirportCode);

            //                 COMMENT one set or the other to test both:
            // Truncated
            //
            row.append("<div class='cell' title='"+ srcAirportFull +"'>" + getCountryFlagImg(link.fromCountryCode) + ' ' + srcAirportFull.slice(-4, -1) + "</div>")
            row.append("<div class='cell' title='"+ destAirportFull +"'>" + getCountryFlagImg(link.toCountryCode) + ' ' + destAirportFull.slice(-4, -1) + "</div>")
            //
            //    OR
            //
            // Original/Full airport names
            //
            //row.append("<div class='cell'>" + getCountryFlagImg(link.fromCountryCode) + ' ' + srcAirportFull + "</div>")
            //row.append("<div class='cell'>" + getCountryFlagImg(link.toCountryCode) + ' ' + destAirportFull + "</div>")
            //
            //    OR
            //
            // Reversed, IATA/ICAO first w/ truncation
            //
            //row.append("<div class='cell' style='text-overflow: ellipsis;overflow: hidden;white-space: pre;' title='"+ srcAirportFull +"'>" + getCountryFlagImg(link.fromCountryCode) + ' ' + srcAirportFull.slice(-4, -1) + ' | ' + srcAirportFull.slice(0, -5) + "</div>")
            //row.append("<div class='cell' style='text-overflow: ellipsis;overflow: hidden;white-space: pre;' title='"+ destAirportFull +"'>" + getCountryFlagImg(link.toCountryCode) + ' ' + destAirportFull.slice(-4, -1) + ' | ' + destAirportFull.slice(0, -5) + "</div>")
            //

            row.append("<div class='cell' style='text-overflow: ellipsis;overflow: hidden;white-space: pre;'>" + getShortModelName(link.model) + "</div>")
            row.append("<div class='cell' align='right'>" + link.distance + "km</div>")
            row.append("<div class='cell' align='right'>" + link.totalCapacity + " (" + link.frequency + ")</div>")
            row.append("<div class='cell' align='right'>" + link.totalPassengers + "</div>")

            // row.append("<div style='"+getKeyedStyleFromLink(link, 'totalLoadFactor', 0, 100)+"' class='cell' align='right'>" + link.totalLoadFactor + '%' + "</div>")
            const lfBreakdown = {
                economy: link.passengers.economy / link.capacity.economy,
                business: link.passengers.business / link.capacity.business,
                first: link.passengers.first / link.capacity.first,
            };

            lfBreakdownText = link.totalLoadFactor === 100
                ? '100'
                : [lfBreakdown.economy, lfBreakdown.business, lfBreakdown.first].map(v => v ? Math.floor(100 * v) : '-').join('/')

            row.append("<div style='text-wrap:nowrap;font-size:9px;"+getKeyedStyleFromLink(link, 'totalLoadFactor', 0, 100)+"' class='cell' align='right'>" + lfBreakdownText + '%' + "</div>")

            row.append("<div style='"+getKeyedStyleFromLink(link, 'satisfaction', 0, 1)+"' class='cell' align='right'>" + Math.round(link.satisfaction * 100) + '%' + "</div>")
            row.append("<div style='"+getKeyedStyleFromLink(link, 'revenue')+"'  class='cell' align='right' title='$"+ commaSeparateNumber(link.revenue) +"'>" + '$' + commaSeparateNumberForLinks(link.revenue) + "</div>")
            row.append("<div style='"+getKeyedStyleFromLink(link, 'profit')+"'  class='cell' align='right' title='$"+ commaSeparateNumber(link.profit) +"'>" + '$' + commaSeparateNumberForLinks(link.profit) +"</div>")

            //row.append("<div style='color:"+textColor+";' class='cell' align='right'>" + (link.profitMargin > 0 ? '+' : '') + Math.round(link.profitMargin) + "%</div>")
            row.append("<div style='"+getKeyedStyleFromLink(link, 'profitMarginPercent', 0, 136.5)+"' class='cell' align='right'>" + (link.profitMargin > 0 ? '+' : '') + Math.round(link.profitMargin) + "%</div>")

            row.append("<div style='"+getKeyedStyleFromLink(link, 'profitPerPax')+"' class='cell' align='right' title='$"+ commaSeparateNumber(link.profitPerPax) +"'>" + '$' + commaSeparateNumberForLinks(link.profitPerPax) + "</div>")
            row.append("<div style='"+getKeyedStyleFromLink(link, 'profitPerFlight')+"' class='cell' align='right' title='$"+ commaSeparateNumber(link.profitPerFlight) +"'>" + '$' + commaSeparateNumberForLinks(link.profitPerFlight) + "</div>")
            row.append("<div style='"+getKeyedStyleFromLink(link, 'profitPerHour')+"' class='cell' align='right' title='$"+ commaSeparateNumber(link.profitPerHour) +"'>" + '$' + commaSeparateNumberForLinks(link.profitPerHour) + "</div>")

            if (selectedLink == link.id) {
                row.addClass("selected")
            }

            const tiersRank = link.tiersRank = Object.keys(link.tiers).reduce((sum, key) => sum + link.tiers[key] + (key === 'profit' && link.tiers[key] === 0 ? -1 : 0), 0);

            row.prepend("<div class='cell'>" + link.tiersRank + "</div>")

            if (tiersRank < 2) {
                row.css({'text-shadow': '0 0 3px gold'});
            }

            if (tiersRank > 27) {
                row.css({'text-shadow': '0 0 3px red'});
            }

            linksTable.append(row)
        });
    }


    _updateLatestOilPriceInHeader();
};

$(document).ready(() => setTimeout(() => launch(), 1000));


//$('body').attr({style:'background: rgb(83, 85, 113);'});


// Tighten up table width from 920px
$('#linksCanvas div.table.data').attr({style:'tableLayout:auto; minWidth:fit-content;'});
$('#linksCanvas div.table-container-y').attr({style:'minWidth:fit-content;'});



console.log("Plane score script loaded");