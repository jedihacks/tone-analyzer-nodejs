/**
 * Copyright 2015 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
 /* eslint camelcase: "warn" */
 /* global  _, normalize, scrollTo,
     App
     emotionBarGraphTemplate,
     filtersTemplate,
     originalTextTemplate,
     sentenceRankTemplate,
     originalTextTooltipTemplate,
     originalTextLegendTemplate
  */

'use strict';
/*
 * JQuery on ready callback function
 */
function ready() {
  // CSRF protection
  $.ajaxSetup({
    headers: {
      'csrf-token': $('meta[name="ct"]').attr('content')
    }
  });

  // load all json data first
  $.when(
    $.ajax('/data/threshold_v0.1.1.json'),
    $.ajax('/data/tweets.txt'),
    $.ajax('/data/review.txt'),
    $.ajax('/data/personal-email.txt'),
    $.ajax('/data/lang-fr.txt'))
    .done(function(thresholds, tweets, review, personalEmail, langFr) {
      var sampleText = {
        'review': review[0],
        'tweets': tweets[0],
        'email': personalEmail[0],
        'lang-fr': langFr[0],
        'own-text': ''
      };
      allReady(thresholds[0], sampleText);
    });
}

/**
 * Load application after initial json data is loaded
 * @param {Object} thresholds thresholds json
 * @param {Object} sampleText collection of sample text json
 * @return {undefined}
 */
function allReady(thresholds, sampleText) {
  var $input = $('.input'),
    $output = $('.output'),
    $loading = $('.loading'),
    $error = $('.error'),
    $errorMessage = $('.error--message'),
    $inputRadio = $('.input--radio'),
    $textarea = $('.input--textarea'),
    $submitButton = $('.input--submit-button'),
    $emotionGraph = $('.summary-emotion-graph'),
    $summaryJsonButton = $('.js-toggle-summary-json'),
    $summaryJson = $('.js-summary-json'),
    $summaryJsonView = $('.js-toggle-summary-json_show'),
    $summaryJsonHide = $('.js-toggle-summary-json_hide'),
    $summaryJsonCode = $('.js-summary-json .json--code'),
    $emotionFilters = $('.filters--emotion'),
    $originalTexts = $('.original-text--texts'),
    $originalTextTooltipContainer = $('.original-text--tooltip-container'),
    $originalTextDescription = $('.original-text--description'),
    $legend = $('.original-text--legend'),
    $sentenceRankTable = $('.sentence-rank--table'),
    $sentenceJson = $('.json .json--code'),
    $outputResetButton = $('.output--reset-button'),
    $documentWarning = $('.document--warning'),
    emotionBarGraph_template = emotionBarGraphTemplate.innerHTML, // eslint-disable-line camelcase
    filters_template = filtersTemplate.innerHTML, // eslint-disable-line camelcase
    originalText_template = originalTextTemplate.innerHTML, // eslint-disable-line camelcase
    sentenceRank_template = sentenceRankTemplate.innerHTML, // eslint-disable-line camelcase
    originalTextTooltip_template = originalTextTooltipTemplate.innerHTML, // eslint-disable-line camelcase
    originalTextLegend_template = originalTextLegendTemplate.innerHTML, // eslint-disable-line camelcase
    selectedInputSample = $('input[name=rb]:checked').val(),
    lastSentenceID;

  /**
   * Callback function for AJAX post to get tone analyzer data
   * @param {Object} data response data from api
   * @return {undefined}
   */
  function toneCallback(data) {
    $input.show();
    $loading.hide();
    $error.hide();
    $output.show();
    scrollTo($output);

    var emotionTone = data.document_tone.tones,
      selectedSample = $('input[name=rb]:checked').val(),
      selectedSampleText = $textarea.val(),
      sentences, sentenceTone = [],
      app;

    // if only one sentence, sentences will not exist, so mutate sentences_tone manually
    if (typeof (data.sentences_tone) === 'undefined' || data.sentences_tone === null) {
      data.sentences_tone = [{
        sentence_id: 0,
        text: selectedSampleText,
        tones: data.document_tone.tones
      }];
    }
    sentences = data.sentences_tone.splice(0);

    //Populate sentencesTone with all unique tones in sentences, to be displayed in sentence view
    sentences.forEach(function(elements) {
      elements.tones.forEach(function(item) {
        if (sentenceTone[item.tone_id] == null || sentenceTone[item.tone_id].score < item.score){
          sentenceTone[item.tone_id] = item;
        }
      });
    });
    sentenceTone = Object.keys(sentenceTone).sort().map(function(obj) {
      return sentenceTone[obj];
    });

    //Display document level warning if present
    if(data.document_tone.warning != null){
      $documentWarning.html(data.document_tone.warning);
    }
    else{
      $documentWarning.html('');
      $documentWarning.outerHTML = '';
    }

    app = new App(data.document_tone, sentences.slice(0), thresholds, selectedSample, sentenceTone); // clone sentences

    /**
     * Map Callback function for emotion document tones
     * @param {Object} item current iterating element
     * @return {Object} label, score, threshold
     */
    function emotionMap(item) {
      var v1 = app.percentagify(item.score, 'Emotion Tone');
      var v2 = app.percentagify(app.thresholds().doc[item.tone_name][0]);
      var v3 = app.percentagify(app.thresholds().doc[item.tone_name][1]);
      return {
        label: item.tone_name,
        score: app.percentagify(item.score, 'Emotion Tone'),
        tooltip: app.toneHash()[item.tone_name].tooltip,
        likeliness:  v1 > v3 ? 'VERY LIKELY' :  v1 >= v2 ? 'LIKELY' : 'UNLIKELY',
        visible:  v1 > v3 ? 'show' :  v1 >= v2 ? 'show' : 'dim',
        thresholdLow: app.percentagify(app.thresholds().doc[item.tone_name][0]),
        thresholdHigh: app.percentagify(app.thresholds().doc[item.tone_name][1])
      };
    }

    /**
     * Make sure height of sentences view is same as filters view
     * @return {undefined}
     */
    function matchSentenceViewsHeight() {
      $('.sentences--sentence-views').css('height', $('.sentences--filters')[0].getBoundingClientRect().height + 'px');
    }

    /**
     * Toggle sentence rank, Emit view update
     * @return {undefined}
     */
    function toggleSort() {
      app.toggleLowToHigh();
      updateSentenceRank();
    }

    /**
     * Select tone, Emit view update
     * @param {String} toneName tone name
     * @return {undefined}
     */
    function clickFilter(toneName) {
      app.selectedFilter(toneName);
      updateOriginalText();
      updateSentenceRank();
      updateLegend();
      updateOriginalText();
    }

    /**
     * Select right filter
     * @return {undefined}
     */
    function updateFilters() {
      if (app.selectedFilter() == 'No Tone' && sentences[0].tones.length > 0){
        app.selectedFilter(sentences[0].tones[0].tone_name);
      }

      //Normalize only in case of 'No Tone'
      if (app.selectedFilter() == 'No Tone') {
        $('.filters--radio[data-id=' + normalize(app.selectedFilter()) + ']').prop('checked', true);
      }
      else {
        $('.filters--radio[data-id=' + app.selectedFilter() + ']').prop('checked', true);
      }
    }

    /**
     * Emit view update for original text view
     * @return {undefined}
     */
    function updateOriginalText() {
      $originalTexts.html(_.template(originalText_template, {
        items: app.updateOriginalSentences()
      }));
      $originalTextDescription.html(app.updateOriginalTextDescription());
    }


    /**
     * Emit view update for sentence rank view
     * @return {undefined}
     */
    function updateSentenceRank() {
      $sentenceRankTable.html(_.template(sentenceRank_template, {
        items: app.updateRankedSentences()
      }));
    }

    /**
     * Update original text tooltip positioning
     * @param {Object} e event data object
     * @return {undefined}
     */
    function positionOriginalTextTooltip(e) {
      var element = app.currentHoveredOriginalSentence(),
        box = element.getBoundingClientRect(),
        originalText = document.querySelector('.original-text'),
        top = box.top,
        left = box.left + originalText.getBoundingClientRect().width * 0.05;

      if (typeof (e) !== 'undefined') {
        left = e.clientX;
      }
      $originalTextTooltipContainer.css({
        'top': top,
        'left': left
      });
    }

    /**
     * Emit view update for original text tooltip view
     * @param {int} index of currently hovering original sentence element
     * @return {undefined}
     */
    function updateOriginalTextTooltip(index) {
      $originalTextTooltipContainer.html(_.template(originalTextTooltip_template, {
        items: app.updateOriginalSentencesTooltips(index),
        isSocialTone: 'Emotion Tone'
      }));
    }

    /**
     * Emit view update for legend view
     * @return {undefined}
     */
    function updateLegend() {
      if (sentenceTone.length > 0){
        $legend.html(_.template(originalTextLegend_template, {
          className: normalize(app.selectedFilter())
        }));
      }
      else{
        $legend.html(_.template(originalTextLegend_template, {
          className: ''
        }));
      }
    }

    /**
     * Bind original text view hover events for original text tooltip
     * interactions
     * @return {undefined}
     */
    function bindOriginalTextHoverEvents() {
      $('.original-text--sentence-container').click(function(e) {
        e.stopPropagation();
        var id = $(this).data('index');
        // if we clicked on same sentence last time, then hide tooltip
        if (lastSentenceID === id) {
          $originalTextTooltipContainer.toggleClass('original-text--tooltip-container_hidden');
        } else {
          app.currentHoveredOriginalSentence(this);
          updateOriginalTextTooltip(id);
          $originalTextTooltipContainer.removeClass('original-text--tooltip-container_hidden');
          app.isHoveringOriginalText(true);
          $('.original-text--sentence-container').not('[data-index="' + id + '"]');

          positionOriginalTextTooltip(e);
        }
        lastSentenceID = id;
      });

      $('body').click(function(e) {
        if (!$(e.target).hasClass('original-text--sentence-container')) {
          $originalTextTooltipContainer.addClass('original-text--tooltip-container_hidden');
        }
      });

      $(document).scroll(function() {
        $originalTextTooltipContainer.addClass('original-text--tooltip-container_hidden');
      });

      $('.original-text--texts-container').scroll(function() {
        $originalTextTooltipContainer.addClass('original-text--tooltip-container_hidden');
      });
    }

    /**
     * Emit view update for json view sentence tones
     * @return {undefined}
     */
    function updateJSONSentenceTones() {
      $sentenceJson.empty();
      $sentenceJson.text(JSON.stringify({'sentences_tone': data.sentences_tone}, null, 2));
    }

    /**
     * Emit view update for json view sentence tones
     * @return {undefined}
     */
    function updateJSONDocumentTones() {
      $summaryJsonCode.empty();
      $summaryJsonCode.text(JSON.stringify({'document_tone': data.document_tone}, null, 2));
    }

    /**
     * Emit view update for json view
     * @param {Object} jdonData The data
     * @return {undefined}
     */
    function updateJSON(jdonData) {
      updateJSONSentenceTones(jdonData);
      updateJSONDocumentTones(jdonData);
    }

    app.selectFilterBySample();

    emotionTone = emotionTone.map(emotionMap);
    sentenceTone = sentenceTone.map(emotionMap);

    //Display message if no dominant tones at document level
    if (emotionTone == null || emotionTone.length == 0){
      $emotionGraph.html('No dominant tones detected in the document.');
    }
    else{
      $emotionGraph.html(_.template(emotionBarGraph_template, {
        items: emotionTone,
        className: 'emotion'
      }));
    }

    //Display message if no dominant tones at sentence level
    if (sentenceTone == null || sentenceTone.length == 0){
      $emotionFilters.html('No dominant tones detected in the sentences.');
    }
    else{
      $emotionFilters.html(_.template(filters_template, {
        items: sentenceTone
      }));
    }

    updateFilters();
    matchSentenceViewsHeight();
    updateOriginalText();
    updateSentenceRank();
    updateLegend();
    bindOriginalTextHoverEvents();
    updateJSON(data);

    $('.filters--radio').on('click', function() {
      clickFilter($(this).data('id'));
      bindOriginalTextHoverEvents();
    });

    $('.sentence-rank--checkbox').on('change', function() {
      toggleSort();
    });
  }

  /**
   * AJAX Post request on error callback
   * @param {Object} error The error
   * @return {undefined}
   */
  function _error(error) {
    var message = typeof error.responseJSON.error === 'string' ?
      error.responseJSON.error :
      'Error code ' + error.responseJSON.error.code + ': ' + error.responseJSON.error.message;

    if (error.responseJSON.code === 429) {
      message = 'You\'ve sent a lot of requests in a short amount of time. ' +
        'As the CPU cores cool off a bit, wait a few seonds before sending more requests.';
    }
    $errorMessage.text(message);
    $input.show();
    $loading.hide();
    $output.hide();
    $error.show();
    scrollTo($error);
  }

  /**
   * AJAX Post request for tone analyzer api
   * @param {String} text request body text
   * @return {undefined}
   */
  function getToneAnalysis(text) {
    if (selectedInputSample === 'lang-fr'){
      $.post('/api/tone', {'text': text, 'language': 'fr' }, toneCallback)
      .fail(_error);
    }
    else {
      $.post('/api/tone', {'text': text, 'language': 'en' }, toneCallback)
      .fail(_error);
    }
  }

  /**
   * Emit view update for input text area view
   * @param {String} value sample text id
   * @return {undefined}
   */
  function updateTextarea(value) {
    $textarea.val(sampleText[value]);
  }

  /**
   * Reset views to beginning state
   * @return {undefined}
   */
  function reset() {
    $input.show();
    $loading.hide();
    $output.hide();
    $error.hide();
    scrollTo($input);
    $('#input-tweets').trigger('click');
  }

  /**
   * Submit button click event
   */
  $submitButton.click(function() {
    $input.show();
    $loading.show();
    $output.hide();
    $error.hide();
    scrollTo($loading);
    lastSentenceID = null;
    getToneAnalysis($textarea.val());
  });

  /**
   * Input radio button click event
   */
  $inputRadio.click(function() {
    selectedInputSample = $(this).val();
    updateTextarea($(this).val());
  });

  /**
   * Reset button click event
   */
  $outputResetButton.click(function() {
    reset();
  });

  updateTextarea($('.input--radio:checked').val());

  $summaryJsonButton.click(function() {
    $summaryJson.toggle();
    $summaryJsonView.toggle();
    $summaryJsonHide.toggle();
  });
}

$(document).ready(ready);
