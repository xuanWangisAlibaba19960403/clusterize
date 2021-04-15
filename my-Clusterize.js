(function (global, factory) {
  global.Clusterize = factory();
}(this, function () {
  "use strict";

  // https://gist.github.com/padolsey/527683#comment-786682
  var is_mac = navigator.platform.toLowerCase().indexOf('mac') + 1;

  var Clusterize = function (options) {
    if (!(this instanceof Clusterize)) {
      return new Clusterize(data);
    }

    var self = this;

    var defaultsOptions = {
      rows_in_block: 50, // 每个区50个元素
      blocks_in_cluster: 4, // 4个区
      tag: null,
      show_no_data_row: true,
      no_data_class: 'clusterize-no-data',
      no_data_text: 'No data',
      keep_parity: true,
      callbacks: {}
    }

    self.options = {};

    var optionsKey = ['rows_in_block', 'blocks_in_cluster', 'show_no_data_row', 'no_data_class', 'no_data_text', 'keep_parity', 'tag', 'callbacks'];

    optionsKey.forEach((option) => {
      self.options[option] = typeof options[option] != 'undefined' && options[option] != null
        ? options[option]
        : defaultsOptions[option];
    })

    var elems = ['scroll', 'content'];

    elems.forEach((elem) => {
      self[elem + '_elem'] = options[elem + 'Id']
        ? document.getElementById(options[elem + 'Id'])
        : options[elem + 'Elem'];
      if (!self[elem + '_elem']) {
        throw new Error("Error! Could not find " + elem + " element");
      }
    })

    // tabindex forces the browser to keep focus on the scrolling list, fixes #11
    if (!self.content_elem.hasAttribute('tabindex')) {
      self.content_elem.setAttribute('tabindex', 0);
    }

    var rows = Array.isArray(options.rows)
      ? options.rows
      : self.fetchMarkup(),
      cache = {},
      scroll_top = self.scroll_elem.scrollTop;

    // append initial data
    self.insertToDOM(rows, cache);

    self.scroll_elem.scrollTop = scroll_top;

    // adding scroll handler
    var last_cluster = false,
      scroll_debounce = 0,
      pointer_event_set = false,
      scrollEv = function () {
        // fixes scrolling issue on Mac #3
        if (is_mac) {
          if (!pointer_events_set) self.content_elem.style.pointerEvents = 'none';
          pointer_events_set = true;
          clearTimeout(scroll_debounce);
          scroll_debounce = setTimeout(function () {
            self.content_elem.style.pointerEvents = 'auto';
            pointer_events_set = false;
          }, 50);
        }
        if (last_cluster !== (last_cluster = self.getClusterNum())) {
          self.insertToDOM(rows, cache);
        }
        if (self.options.callbacks.scrollingProgress) {
          self.options.callbacks.scrollingProgress(self.getScrollProgress());
        }
      },
      resize_debounce = 0,
      resizeEv = function () {
        clearTimeout(resize_debounce);
        resize_debounce = setTimeout(self.refresh, 100);
      }
    self.scroll_elem.addEventListener('scroll', scrollEv);
    window.addEventListener('resize', resizeEv);

    // public methods
    self.destroy = function (clean) {
      off('scroll', self.scroll_elem, scrollEv);
      off('resize', window, resizeEv);
      self.html((clean ? self.generateEmptyRow() : rows).join(''));
    }
    self.refresh = function (force) {
      if (self.getRowsHeight(rows) || force) self.update(rows);
    }
    self.update = function (new_rows) {
      rows = isArray(new_rows)
        ? new_rows
        : [];
      var scroll_top = self.scroll_elem.scrollTop;
      // fixes #39
      if (rows.length * self.options.item_height < scroll_top) {
        self.scroll_elem.scrollTop = 0;
        last_cluster = 0;
      }
      self.insertToDOM(rows, cache);
      self.scroll_elem.scrollTop = scroll_top;
    }
    self.clear = function () {
      self.update([]);
    }
    self.getRowsAmount = function () {
      return rows.length;
    }
    self.getScrollProgress = function () {
      return this.options.scroll_top / (rows.length * this.options.item_height) * 100 || 0;
    }

    var add = function (where, _new_rows) {
      var new_rows = isArray(_new_rows)
        ? _new_rows
        : [];
      if (!new_rows.length) return;
      rows = where == 'append'
        ? rows.concat(new_rows)
        : new_rows.concat(rows);
      self.insertToDOM(rows, cache);
    }
    self.append = function (rows) {
      add('append', rows);
    }
    self.prepend = function (rows) {
      add('prepend', rows);
    }
  }

  Clusterize.prototype = {
    constructor: Clusterize,
    fetchMarkup() {
      var row = [],
        rows_node = this.getChildNodes(this.content_elem);
      var len = 0;
      while (rows_node.length) {
        var node = rows_node.shift();
        node.setAttribute('data-index', len);
        row.push(node.outerHTML);
        len++;
      }
      return row;
    },
    // get tag name, content tag name, tag height, calc cluster height
    exploreEnvironment: function (rows, cache) {
      var opts = this.options;
      opts.content_tag = this.content_elem.tagName.toLowerCase();// 容器标签
      if (!rows.length) {
        return;
      }
      if (this.content_elem.children.length <= 1) {
        cache.data = this.html(rows[0] + rows[0] + rows[0]);
      }
      if (!opts.tag) {
        opts.tag = this.content_elem.children[0].tagName.toLowerCase();
      }
      this.getRowsHeight(rows);
    },
    getRowsHeight(rows) {
      var opts = this.options,
        prev_item_height = opts.item_height;
      opts.cluster_height = 0;
      if (!rows.length) {
        return;
      }
      var nodes = this.content_elem.children;
      if (!nodes.length) {
        return;
      }
      var node = nodes[Math.floor(nodes.length / 2)];
      opts.item_height = node.offsetHeight;
      // consider margins (and margins collapsing)
      var marginTop = parseInt(getStyle('marginTop', node), 10) || 0;
      var marginBottom = parseInt(getStyle('marginBottom', node), 10) || 0;
      opts.item_height += Math.max(marginTop, marginBottom);

      opts.block_height = opts.item_height * opts.rows_in_block;
      opts.rows_in_cluster = opts.blocks_in_cluster * opts.rows_in_block;
      opts.cluster_height = opts.blocks_in_cluster * opts.block_height;

      return prev_item_height !== opts.item_height;
    },
    getClusterNum() {
      const scrollTop = this.scroll_elem.scrollTop;
      this.options.scroll_top = scrollTop;
      return Math.floor(scrollTop / (this.options.cluster_height - this.options.block_height)) || 0;
    },
    getChildNodes(tag) {
      return Array.prototype.slice.call(tag.children);
    },
    renderExtraTag(class_name, height) {
      var tag = document.createElement(this.options.tag),
        clusterize_prefix = 'clusterize-';
      tag.className = [clusterize_prefix + 'extra-row', clusterize_prefix + class_name].join(' ');
      height && (tag.style.height = height + 'px');
      return tag.outerHTML;
    },
    insertToDOM(rows, cache) {
      // explore row's height
      if (!this.options.cluster_height) { //如果没有设置区域高度
        this.exploreEnvironment(rows, cache);
      }
      var data = this.generate(rows, this.getClusterNum()),
        this_cluster_rows = data.rows.join(''),
        this_cluster_content_changed = this.checkChanges('data', this_cluster_rows, cache),
        top_offset_changed = this.checkChanges('top', data.top_offset, cache),
        only_bottom_offset_changed = this.checkChanges('bottom', data.bottom_offset, cache),
        callbacks = this.options.callbacks,
        layout = [];
      // this_cluster_rows 实际渲染的string串
      // this_cluster_content_changed
      // top_offset_changed
      // only_bottom_offset_changed
      if (this_cluster_content_changed || top_offset_changed) {
        if (data.top_offset) {
          console.log('data.top_offset');
          this.options.keep_parity && layout.push(this.renderExtraTag('keep-parity'));
          layout.push(this.renderExtraTag('top-space', data.top_offset));
        }
        layout.push(this_cluster_rows);
        // 放入底部展位元素
        data.bottom_offset && layout.push(this.renderExtraTag('bottom-space', data.bottom_offset));
        callbacks.clusterWillChange && callbacks.clusterWillChange();
        this.html(layout.join());
        this.content_elem.style['counter-increment'] = 'clusterize-counter ' + (data.rows_above - 1);
        callbacks.clusterChanged && callbacks.clusterChanged();
      } else if (only_bottom_offset_changed) {
        this.content_elem.lastChild.style.height = data.bottom_offset + 'px';
      }
    },
    html(data) {
      var content_elem = this.content_elem;
      content_elem.innerHTML = data;
    },
    // generate cluster for current scroll position
    generate(rows, cluster_num) {
      var opts = this.options,
        rows_len = rows.length;
      if (rows_len < opts.rows_in_block) {
        // 如果当前children数量小于一个块内应有数量
        return {
          top_offset: 0,
          bottom_offset: 0,
          rows_above: 0,
          rows: rows_len ? rows : this.generateEmptyRow() // 没有child返回空的元素
        }
      }
      var items_start = Math.max((opts.rows_in_cluster - opts.rows_in_block) * cluster_num, 0),
        items_end = items_start + opts.rows_in_cluster,
        top_offset = Math.max(items_start * opts.item_height, 0),
        bottom_offset = Math.max((rows_len - items_end) * opts.item_height, 0),
        this_cluster_rows = [],
        rows_above = items_start;
      // console.log(items_start) // 起始渲染index
      // console.log(items_end) // 结束渲染index
      // console.log(top_offset) // 顶部占位元素高度
      // console.log(bottom_offset) // 底部占位元素高度
      // console.log(this_cluster_rows) // 实际渲染元素StringHTML
      // console.log(rows_above) // ??? 计数用
      if (top_offset < 1) {
        rows_above++;
      }
      for (var i = items_start; i < items_end; i++) {
        rows[i] && this_cluster_rows.push(rows[i]);
      }
      return {
        top_offset: top_offset,
        bottom_offset: bottom_offset,
        rows_above: rows_above,
        rows: this_cluster_rows
      }
    },
    checkChanges: function (type, value, cache) {
      var changed = value !== cache[type];
      cache[type] = value;
      return changed;
    }
  }

  function getStyle(prop, elem) {
    return window.getComputedStyle ? window.getComputedStyle(elem)[prop] : elem.currentStyle[prop];
  }

  return Clusterize;
}));
