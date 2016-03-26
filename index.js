/**
 * Return a value that is at least min and at most max.
 * @param {Number} value
 * @param {Number} min
 * @param {Number} max
 * @returns {Number}
 */
function clamp (value, min, max) {
  return Math.max(Math.min(value, max), min)
}

/**
 * Creates a rogneur instance based on image.
 * @param {HTMLElement} image - An image element without a src attribute.
 * @returns {{load: load, updateContainerSize: updateContainerSize, setState: setState, getState: getState}}
 */
function rogneur (image) {
  var container = (function (parent) {
    while (parent) {
      if (window.getComputedStyle(parent).position !== 'static') {
        return parent
      }

      parent = parent.parentElement
    }

    return null
  })(image.parentElement)

  if (container == null) {
    console.error('rogneur needs a parent to have a position other than static')
    return
  }

  var dragging = null
  var state = { position: { x: 0, y: 0 }, original: {}, container: {}, zoom: 1 }
  var stateHandlers = { position: getPosition, zoom: getZoom }

  image.style.position = 'absolute'
  image.style.top = '0'
  image.style.left = '0'
  image.style.transformOrigin = '50% 50% 0'

  document.addEventListener('mousemove', onmousemove)
  document.addEventListener('mouseup', onmouseup)

  image.setAttribute('draggable', 'false')
  image.addEventListener('mousedown', onmousedown)
  image.addEventListener('load', onload)

  updateContainerSize()

  /**
   * mousemove handler that updates the image's position.
   * @param {Event} event
   */
  function onmousemove (event) {
    if (dragging == null) {
      return
    }

    var mousePos = {
      x: event.x + window.pageXOffset,
      y: event.y + window.pageYOffset
    }

    var newPosition = {
      x: mousePos.x - dragging.x,
      y: mousePos.y - dragging.y
    }

    setState({ position: newPosition })
  }

  /**
   * mouseup handler that releases the image.
   */
  function onmouseup () {
    dragging = null
  }

  /**
   * mousedown handler that initiate the drag by setting it's origin position.
   * @param {Event} event
   */
  function onmousedown (event) {
    dragging = {
      x: event.x - state.position.x,
      y: event.y - state.position.y
    }
  }

  /**
   * load handler that's called when an image is loaded.
   * Used to get the image's original size.
   * @param {Event} event
   */
  function onload (event) {
    // using getBoundingClientRect to get the image's real size
    // in the browser and not its natural size or whatever
    //
    // that been said, setting the image's size to anything else
    // that its "natural" one is a terrible idea as
    // it would make it really hard to crop on the server
    var target = event.path[0]
    var rect = target.getBoundingClientRect()
    setState({ original: { width: rect.width, height: rect.height } })
  }

  /**
   * Update the image's position and scale.
   * @returns {{load: load, updateContainerSize: updateContainerSize, setState: setState, getState: getState}}
   */
  function update () {
    image.style.transform = [
      'translate(',
        state.position.x, 'px, ',
        state.position.y, 'px',
      ') ',
      'scale(',
        state.zoom,
      ')'
    ].join('')

    return this
  }

  /**
   * Load an image.
   * @param {String} url - Whatever's suitable for an img.src attribute.
   * @returns {{load: load, updateContainerSize: updateContainerSize, setState: setState, getState: getState}}
   */
  function load (url) {
    // emptying the original's size is a way
    // to prevent unnecessary updates
    state.original = {}
    image.src = url

    return this
  }

  /**
   * Update the container's size in state.
   * Note: we need the container's width and height for some calculations.
   * So this function should be called when the container's size changes.
   */
  function updateContainerSize () {
    var rect = container.getBoundingClientRect()
    setState({ container: { width: rect.width, height: rect.height } })
  }

  /**
   * Returns the correct image position that respects the min/max values.
   * @param {Object} pos
   * @param {Number} pos.x - Image's x position.
   * @param {Number} pos.y - Image's y position.
   * @returns {{x: Number, y: Number}}
   */
  function getPosition (pos) {
    if (!state.original.width || !state.original.height) {
      return pos
    }

    return {
      x: calcPos(pos.x, state.original.width, state.container.width),
      y: calcPos(pos.y, state.original.height, state.container.height)
    }
  }

  /**
   * Takes into account the fact that the image scales from the center.
   * Also clamps the value to the min and max possible values.
   * @param {Number} pos
   * @param {Number} originalSize
   * @param {Number} containerSize
   * @returns {Number}
   */
  function calcPos (pos, originalSize, containerSize) {
    var realSize = originalSize * state.zoom
    var overflow = Math.max(realSize - containerSize, 0)

    var lowestValue = (realSize - originalSize) / 2
    var min = lowestValue - overflow

    var highestValue = (containerSize + lowestValue) - realSize
    var max = highestValue + overflow

    return clamp(pos, min, max)
  }

  /**
   * Returns the zoom respecting the min value.
   * @param {Number} zoom
   * @returns {number}
   */
  function getZoom (zoom) {
    if (!state.original.width || !state.original.height) {
      return zoom
    }

    var min = (function () {
      var imageSize =
        state.original.width > state.original.height
          ? state.original.width
          : state.original.height

      var containerSize =
        state.container.width > state.container.height
          ? state.container.width
          : state.container.height

      return containerSize / imageSize
    })()

    return Math.max(zoom, min)
  }

  /**
   * Update the state, ensure the values respect
   * the min/max rules and persist it to the view.
   * @param {Object} newState
   * @returns {{load: load, updateContainerSize: updateContainerSize, setState: setState, getState: getState}}
   */
  function setState (newState) {
    applyState(newState)

    // by applying the current values, we're ensuring
    // that they do match their min/max rules
    //
    // Note: we need to apply the zoom first for
    //       the position to be properly calculated

    if (!newState.hasOwnProperty('zoom')) {
      applyState({ zoom: state.zoom })
    }

    if (!newState.hasOwnProperty('position')) {
      applyState({ position: state.position })
    }

    update()
    return this
  }

  /**
   * Update the state and calls the relevant state handlers.
   * e.g updating the image's position needs some calculation that is done by its handler.
   * Also calls update to apply the changes to the image.
   * @param {Object} newState
   * @returns {{load: load, updateContainerSize: updateContainerSize, setState: setState, getState: getState}}
   */
  function applyState (newState) {
    for (var key in newState) {
      if (!newState.hasOwnProperty(key)) {
        continue
      }

      if (stateHandlers.hasOwnProperty(key)) {
        var handler = stateHandlers[key]
        state[key] = handler(newState[key])
      } else {
        state[key] = newState[key]
      }
    }

    return this
  }

  /**
   * Returns the state.
   * @returns {{position: {x: Number, y: Number}, original: {width: Number, height: Number}, container: {width: Number, height: Number}, zoom: Number}}
   */
  function getState () {
    return state
  }

  return {
    load: load,
    updateContainerSize: updateContainerSize,
    setState: setState,
    getState: getState
  }
}

module.exports = rogneur
