var app = (function () {
    'use strict';

    function noop() { }
    const identity = x => x;
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function create_slot(definition, ctx, $$scope, fn) {
        if (definition) {
            const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
            return definition[0](slot_ctx);
        }
    }
    function get_slot_context(definition, ctx, $$scope, fn) {
        return definition[1] && fn
            ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
            : $$scope.ctx;
    }
    function get_slot_changes(definition, $$scope, dirty, fn) {
        if (definition[2] && fn) {
            const lets = definition[2](fn(dirty));
            if ($$scope.dirty === undefined) {
                return lets;
            }
            if (typeof lets === 'object') {
                const merged = [];
                const len = Math.max($$scope.dirty.length, lets.length);
                for (let i = 0; i < len; i += 1) {
                    merged[i] = $$scope.dirty[i] | lets[i];
                }
                return merged;
            }
            return $$scope.dirty | lets;
        }
        return $$scope.dirty;
    }
    function update_slot(slot, slot_definition, ctx, $$scope, dirty, get_slot_changes_fn, get_slot_context_fn) {
        const slot_changes = get_slot_changes(slot_definition, $$scope, dirty, get_slot_changes_fn);
        if (slot_changes) {
            const slot_context = get_slot_context(slot_definition, ctx, $$scope, get_slot_context_fn);
            slot.p(slot_context, slot_changes);
        }
    }

    const is_client = typeof window !== 'undefined';
    let now = is_client
        ? () => window.performance.now()
        : () => Date.now();
    let raf = is_client ? cb => requestAnimationFrame(cb) : noop;

    const tasks = new Set();
    function run_tasks(now) {
        tasks.forEach(task => {
            if (!task.c(now)) {
                tasks.delete(task);
                task.f();
            }
        });
        if (tasks.size !== 0)
            raf(run_tasks);
    }
    /**
     * Creates a new task that runs on each raf frame
     * until it returns a falsy value or is aborted
     */
    function loop(callback) {
        let task;
        if (tasks.size === 0)
            raf(run_tasks);
        return {
            promise: new Promise(fulfill => {
                tasks.add(task = { c: callback, f: fulfill });
            }),
            abort() {
                tasks.delete(task);
            }
        };
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function prevent_default(fn) {
        return function (event) {
            event.preventDefault();
            // @ts-ignore
            return fn.call(this, event);
        };
    }
    function self(fn) {
        return function (event) {
            // @ts-ignore
            if (event.target === this)
                fn.call(this, event);
        };
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.data !== data)
            text.data = data;
    }
    function set_input_value(input, value) {
        input.value = value == null ? '' : value;
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    const active_docs = new Set();
    let active = 0;
    // https://github.com/darkskyapp/string-hash/blob/master/index.js
    function hash(str) {
        let hash = 5381;
        let i = str.length;
        while (i--)
            hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
        return hash >>> 0;
    }
    function create_rule(node, a, b, duration, delay, ease, fn, uid = 0) {
        const step = 16.666 / duration;
        let keyframes = '{\n';
        for (let p = 0; p <= 1; p += step) {
            const t = a + (b - a) * ease(p);
            keyframes += p * 100 + `%{${fn(t, 1 - t)}}\n`;
        }
        const rule = keyframes + `100% {${fn(b, 1 - b)}}\n}`;
        const name = `__svelte_${hash(rule)}_${uid}`;
        const doc = node.ownerDocument;
        active_docs.add(doc);
        const stylesheet = doc.__svelte_stylesheet || (doc.__svelte_stylesheet = doc.head.appendChild(element('style')).sheet);
        const current_rules = doc.__svelte_rules || (doc.__svelte_rules = {});
        if (!current_rules[name]) {
            current_rules[name] = true;
            stylesheet.insertRule(`@keyframes ${name} ${rule}`, stylesheet.cssRules.length);
        }
        const animation = node.style.animation || '';
        node.style.animation = `${animation ? `${animation}, ` : ``}${name} ${duration}ms linear ${delay}ms 1 both`;
        active += 1;
        return name;
    }
    function delete_rule(node, name) {
        const previous = (node.style.animation || '').split(', ');
        const next = previous.filter(name
            ? anim => anim.indexOf(name) < 0 // remove specific animation
            : anim => anim.indexOf('__svelte') === -1 // remove all Svelte animations
        );
        const deleted = previous.length - next.length;
        if (deleted) {
            node.style.animation = next.join(', ');
            active -= deleted;
            if (!active)
                clear_rules();
        }
    }
    function clear_rules() {
        raf(() => {
            if (active)
                return;
            active_docs.forEach(doc => {
                const stylesheet = doc.__svelte_stylesheet;
                let i = stylesheet.cssRules.length;
                while (i--)
                    stylesheet.deleteRule(i);
                doc.__svelte_rules = {};
            });
            active_docs.clear();
        });
    }

    function create_animation(node, from, fn, params) {
        if (!from)
            return noop;
        const to = node.getBoundingClientRect();
        if (from.left === to.left && from.right === to.right && from.top === to.top && from.bottom === to.bottom)
            return noop;
        const { delay = 0, duration = 300, easing = identity, 
        // @ts-ignore todo: should this be separated from destructuring? Or start/end added to public api and documentation?
        start: start_time = now() + delay, 
        // @ts-ignore todo:
        end = start_time + duration, tick = noop, css } = fn(node, { from, to }, params);
        let running = true;
        let started = false;
        let name;
        function start() {
            if (css) {
                name = create_rule(node, 0, 1, duration, delay, easing, css);
            }
            if (!delay) {
                started = true;
            }
        }
        function stop() {
            if (css)
                delete_rule(node, name);
            running = false;
        }
        loop(now => {
            if (!started && now >= start_time) {
                started = true;
            }
            if (started && now >= end) {
                tick(1, 0);
                stop();
            }
            if (!running) {
                return false;
            }
            if (started) {
                const p = now - start_time;
                const t = 0 + 1 * easing(p / duration);
                tick(t, 1 - t);
            }
            return true;
        });
        start();
        tick(0, 1);
        return stop;
    }
    function fix_position(node) {
        const style = getComputedStyle(node);
        if (style.position !== 'absolute' && style.position !== 'fixed') {
            const { width, height } = style;
            const a = node.getBoundingClientRect();
            node.style.position = 'absolute';
            node.style.width = width;
            node.style.height = height;
            add_transform(node, a);
        }
    }
    function add_transform(node, a) {
        const b = node.getBoundingClientRect();
        if (a.left !== b.left || a.top !== b.top) {
            const style = getComputedStyle(node);
            const transform = style.transform === 'none' ? '' : style.transform;
            node.style.transform = `${transform} translate(${a.left - b.left}px, ${a.top - b.top}px)`;
        }
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error(`Function called outside component initialization`);
        return current_component;
    }
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }
    // TODO figure out if we still want to support
    // shorthand events, or if we want to implement
    // a real bubbling mechanism
    function bubble(component, event) {
        const callbacks = component.$$.callbacks[event.type];
        if (callbacks) {
            callbacks.slice().forEach(fn => fn(event));
        }
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }

    let promise;
    function wait() {
        if (!promise) {
            promise = Promise.resolve();
            promise.then(() => {
                promise = null;
            });
        }
        return promise;
    }
    function dispatch(node, direction, kind) {
        node.dispatchEvent(custom_event(`${direction ? 'intro' : 'outro'}${kind}`));
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    const null_transition = { duration: 0 };
    function create_bidirectional_transition(node, fn, params, intro) {
        let config = fn(node, params);
        let t = intro ? 0 : 1;
        let running_program = null;
        let pending_program = null;
        let animation_name = null;
        function clear_animation() {
            if (animation_name)
                delete_rule(node, animation_name);
        }
        function init(program, duration) {
            const d = program.b - t;
            duration *= Math.abs(d);
            return {
                a: t,
                b: program.b,
                d,
                duration,
                start: program.start,
                end: program.start + duration,
                group: program.group
            };
        }
        function go(b) {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            const program = {
                start: now() + delay,
                b
            };
            if (!b) {
                // @ts-ignore todo: improve typings
                program.group = outros;
                outros.r += 1;
            }
            if (running_program) {
                pending_program = program;
            }
            else {
                // if this is an intro, and there's a delay, we need to do
                // an initial tick and/or apply CSS animation immediately
                if (css) {
                    clear_animation();
                    animation_name = create_rule(node, t, b, duration, delay, easing, css);
                }
                if (b)
                    tick(0, 1);
                running_program = init(program, duration);
                add_render_callback(() => dispatch(node, b, 'start'));
                loop(now => {
                    if (pending_program && now > pending_program.start) {
                        running_program = init(pending_program, duration);
                        pending_program = null;
                        dispatch(node, running_program.b, 'start');
                        if (css) {
                            clear_animation();
                            animation_name = create_rule(node, t, running_program.b, running_program.duration, 0, easing, config.css);
                        }
                    }
                    if (running_program) {
                        if (now >= running_program.end) {
                            tick(t = running_program.b, 1 - t);
                            dispatch(node, running_program.b, 'end');
                            if (!pending_program) {
                                // we're done
                                if (running_program.b) {
                                    // intro — we can tidy up immediately
                                    clear_animation();
                                }
                                else {
                                    // outro — needs to be coordinated
                                    if (!--running_program.group.r)
                                        run_all(running_program.group.c);
                                }
                            }
                            running_program = null;
                        }
                        else if (now >= running_program.start) {
                            const p = now - running_program.start;
                            t = running_program.a + running_program.d * easing(p / running_program.duration);
                            tick(t, 1 - t);
                        }
                    }
                    return !!(running_program || pending_program);
                });
            }
        }
        return {
            run(b) {
                if (is_function(config)) {
                    wait().then(() => {
                        // @ts-ignore
                        config = config();
                        go(b);
                    });
                }
                else {
                    go(b);
                }
            },
            end() {
                clear_animation();
                running_program = pending_program = null;
            }
        };
    }
    function outro_and_destroy_block(block, lookup) {
        transition_out(block, 1, 1, () => {
            lookup.delete(block.key);
        });
    }
    function fix_and_outro_and_destroy_block(block, lookup) {
        block.f();
        outro_and_destroy_block(block, lookup);
    }
    function update_keyed_each(old_blocks, dirty, get_key, dynamic, ctx, list, lookup, node, destroy, create_each_block, next, get_context) {
        let o = old_blocks.length;
        let n = list.length;
        let i = o;
        const old_indexes = {};
        while (i--)
            old_indexes[old_blocks[i].key] = i;
        const new_blocks = [];
        const new_lookup = new Map();
        const deltas = new Map();
        i = n;
        while (i--) {
            const child_ctx = get_context(ctx, list, i);
            const key = get_key(child_ctx);
            let block = lookup.get(key);
            if (!block) {
                block = create_each_block(key, child_ctx);
                block.c();
            }
            else if (dynamic) {
                block.p(child_ctx, dirty);
            }
            new_lookup.set(key, new_blocks[i] = block);
            if (key in old_indexes)
                deltas.set(key, Math.abs(i - old_indexes[key]));
        }
        const will_move = new Set();
        const did_move = new Set();
        function insert(block) {
            transition_in(block, 1);
            block.m(node, next);
            lookup.set(block.key, block);
            next = block.first;
            n--;
        }
        while (o && n) {
            const new_block = new_blocks[n - 1];
            const old_block = old_blocks[o - 1];
            const new_key = new_block.key;
            const old_key = old_block.key;
            if (new_block === old_block) {
                // do nothing
                next = new_block.first;
                o--;
                n--;
            }
            else if (!new_lookup.has(old_key)) {
                // remove old block
                destroy(old_block, lookup);
                o--;
            }
            else if (!lookup.has(new_key) || will_move.has(new_key)) {
                insert(new_block);
            }
            else if (did_move.has(old_key)) {
                o--;
            }
            else if (deltas.get(new_key) > deltas.get(old_key)) {
                did_move.add(new_key);
                insert(new_block);
            }
            else {
                will_move.add(old_key);
                o--;
            }
        }
        while (o--) {
            const old_block = old_blocks[o];
            if (!new_lookup.has(old_block.key))
                destroy(old_block, lookup);
        }
        while (n)
            insert(new_blocks[n - 1]);
        return new_blocks;
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if ($$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }

    /* src/Header.svelte generated by Svelte v3.23.2 */

    function create_fragment(ctx) {
    	let header;

    	return {
    		c() {
    			header = element("header");
    			header.innerHTML = `<h1>Todo App</h1>`;
    			attr(header, "class", "svelte-3rm8kq");
    		},
    		m(target, anchor) {
    			insert(target, header, anchor);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(header);
    		}
    	};
    }

    class Header extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, null, create_fragment, safe_not_equal, {});
    	}
    }

    function cubicOut(t) {
        const f = t - 1.0;
        return f * f * f + 1.0;
    }

    function fade(node, { delay = 0, duration = 400, easing = identity }) {
        const o = +getComputedStyle(node).opacity;
        return {
            delay,
            duration,
            easing,
            css: t => `opacity: ${t * o}`
        };
    }
    function slide(node, { delay = 0, duration = 400, easing = cubicOut }) {
        const style = getComputedStyle(node);
        const opacity = +style.opacity;
        const height = parseFloat(style.height);
        const padding_top = parseFloat(style.paddingTop);
        const padding_bottom = parseFloat(style.paddingBottom);
        const margin_top = parseFloat(style.marginTop);
        const margin_bottom = parseFloat(style.marginBottom);
        const border_top_width = parseFloat(style.borderTopWidth);
        const border_bottom_width = parseFloat(style.borderBottomWidth);
        return {
            delay,
            duration,
            easing,
            css: t => `overflow: hidden;` +
                `opacity: ${Math.min(t * 20, 1) * opacity};` +
                `height: ${t * height}px;` +
                `padding-top: ${t * padding_top}px;` +
                `padding-bottom: ${t * padding_bottom}px;` +
                `margin-top: ${t * margin_top}px;` +
                `margin-bottom: ${t * margin_bottom}px;` +
                `border-top-width: ${t * border_top_width}px;` +
                `border-bottom-width: ${t * border_bottom_width}px;`
        };
    }
    function scale(node, { delay = 0, duration = 400, easing = cubicOut, start = 0, opacity = 0 }) {
        const style = getComputedStyle(node);
        const target_opacity = +style.opacity;
        const transform = style.transform === 'none' ? '' : style.transform;
        const sd = 1 - start;
        const od = target_opacity * (1 - opacity);
        return {
            delay,
            duration,
            easing,
            css: (_t, u) => `
			transform: ${transform} scale(${1 - (sd * u)});
			opacity: ${target_opacity - (od * u)}
		`
        };
    }

    /* src/ListItem.svelte generated by Svelte v3.23.2 */

    function create_if_block(ctx) {
    	let p;
    	let t_value = /*todo*/ ctx[0].desc + "";
    	let t;
    	let p_transition;
    	let current;

    	return {
    		c() {
    			p = element("p");
    			t = text(t_value);
    			attr(p, "class", "svelte-4jmud4");
    		},
    		m(target, anchor) {
    			insert(target, p, anchor);
    			append(p, t);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty & /*todo*/ 1) && t_value !== (t_value = /*todo*/ ctx[0].desc + "")) set_data(t, t_value);
    		},
    		i(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!p_transition) p_transition = create_bidirectional_transition(p, slide, {}, true);
    				p_transition.run(1);
    			});

    			current = true;
    		},
    		o(local) {
    			if (!p_transition) p_transition = create_bidirectional_transition(p, slide, {}, false);
    			p_transition.run(0);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(p);
    			if (detaching && p_transition) p_transition.end();
    		}
    	};
    }

    function create_fragment$1(ctx) {
    	let div1;
    	let div0;
    	let h4;
    	let t0_value = /*todo*/ ctx[0].title + "";
    	let t0;
    	let t1;
    	let img;
    	let img_src_value;
    	let t2;
    	let current;
    	let mounted;
    	let dispose;
    	let if_block = /*isDescOpen*/ ctx[1] && create_if_block(ctx);

    	return {
    		c() {
    			div1 = element("div");
    			div0 = element("div");
    			h4 = element("h4");
    			t0 = text(t0_value);
    			t1 = space();
    			img = element("img");
    			t2 = space();
    			if (if_block) if_block.c();
    			attr(h4, "class", "svelte-4jmud4");
    			if (img.src !== (img_src_value = "icons/delete.svg")) attr(img, "src", img_src_value);
    			attr(img, "class", "svelte-4jmud4");
    			attr(div0, "class", "top svelte-4jmud4");
    			attr(div1, "class", "wrapper svelte-4jmud4");
    		},
    		m(target, anchor) {
    			insert(target, div1, anchor);
    			append(div1, div0);
    			append(div0, h4);
    			append(h4, t0);
    			append(div0, t1);
    			append(div0, img);
    			append(div1, t2);
    			if (if_block) if_block.m(div1, null);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen(h4, "click", /*toggleDescOpen*/ ctx[2]),
    					listen(img, "click", /*onDeleteTodo*/ ctx[3]),
    					listen(div1, "click", self(/*toggleDescOpen*/ ctx[2]))
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if ((!current || dirty & /*todo*/ 1) && t0_value !== (t0_value = /*todo*/ ctx[0].title + "")) set_data(t0, t0_value);

    			if (/*isDescOpen*/ ctx[1]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*isDescOpen*/ 2) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(div1, null);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div1);
    			if (if_block) if_block.d();
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	const dispatch = createEventDispatcher();
    	let { todo } = $$props;
    	let isDescOpen = false;

    	function toggleDescOpen() {
    		$$invalidate(1, isDescOpen = !isDescOpen);
    	}

    	function onDeleteTodo() {
    		dispatch("deleteTodo", todo.id);
    	}

    	$$self.$set = $$props => {
    		if ("todo" in $$props) $$invalidate(0, todo = $$props.todo);
    	};

    	return [todo, isDescOpen, toggleDescOpen, onDeleteTodo];
    }

    class ListItem extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance, create_fragment$1, safe_not_equal, { todo: 0 });
    	}
    }

    function flip(node, animation, params) {
        const style = getComputedStyle(node);
        const transform = style.transform === 'none' ? '' : style.transform;
        const scaleX = animation.from.width / node.clientWidth;
        const scaleY = animation.from.height / node.clientHeight;
        const dx = (animation.from.left - animation.to.left) / scaleX;
        const dy = (animation.from.top - animation.to.top) / scaleY;
        const d = Math.sqrt(dx * dx + dy * dy);
        const { delay = 0, duration = (d) => Math.sqrt(d) * 120, easing = cubicOut } = params;
        return {
            delay,
            duration: is_function(duration) ? duration(d) : duration,
            easing,
            css: (_t, u) => `transform: ${transform} translate(${u * dx}px, ${u * dy}px);`
        };
    }

    /* src/List.svelte generated by Svelte v3.23.2 */

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[2] = list[i];
    	return child_ctx;
    }

    // (16:2) {#each todos as todo (todo.id)}
    function create_each_block(key_1, ctx) {
    	let li;
    	let listitem;
    	let t;
    	let li_transition;
    	let rect;
    	let stop_animation = noop;
    	let current;
    	listitem = new ListItem({ props: { todo: /*todo*/ ctx[2] } });
    	listitem.$on("deleteTodo", /*deleteTodo_handler*/ ctx[1]);

    	return {
    		key: key_1,
    		first: null,
    		c() {
    			li = element("li");
    			create_component(listitem.$$.fragment);
    			t = space();
    			this.first = li;
    		},
    		m(target, anchor) {
    			insert(target, li, anchor);
    			mount_component(listitem, li, null);
    			append(li, t);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const listitem_changes = {};
    			if (dirty & /*todos*/ 1) listitem_changes.todo = /*todo*/ ctx[2];
    			listitem.$set(listitem_changes);
    		},
    		r() {
    			rect = li.getBoundingClientRect();
    		},
    		f() {
    			fix_position(li);
    			stop_animation();
    			add_transform(li, rect);
    		},
    		a() {
    			stop_animation();
    			stop_animation = create_animation(li, rect, flip, {});
    		},
    		i(local) {
    			if (current) return;
    			transition_in(listitem.$$.fragment, local);

    			add_render_callback(() => {
    				if (!li_transition) li_transition = create_bidirectional_transition(li, fade, {}, true);
    				li_transition.run(1);
    			});

    			current = true;
    		},
    		o(local) {
    			transition_out(listitem.$$.fragment, local);
    			if (!li_transition) li_transition = create_bidirectional_transition(li, fade, {}, false);
    			li_transition.run(0);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(li);
    			destroy_component(listitem);
    			if (detaching && li_transition) li_transition.end();
    		}
    	};
    }

    function create_fragment$2(ctx) {
    	let ul;
    	let each_blocks = [];
    	let each_1_lookup = new Map();
    	let current;
    	let each_value = /*todos*/ ctx[0];
    	const get_key = ctx => /*todo*/ ctx[2].id;

    	for (let i = 0; i < each_value.length; i += 1) {
    		let child_ctx = get_each_context(ctx, each_value, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
    	}

    	return {
    		c() {
    			ul = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr(ul, "class", "svelte-6rthfo");
    		},
    		m(target, anchor) {
    			insert(target, ul, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ul, null);
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*todos*/ 1) {
    				const each_value = /*todos*/ ctx[0];
    				group_outros();
    				for (let i = 0; i < each_blocks.length; i += 1) each_blocks[i].r();
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, ul, fix_and_outro_and_destroy_block, create_each_block, null, get_each_context);
    				for (let i = 0; i < each_blocks.length; i += 1) each_blocks[i].a();
    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o(local) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(ul);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d();
    			}
    		}
    	};
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { todos = [] } = $$props;

    	function deleteTodo_handler(event) {
    		bubble($$self, event);
    	}

    	$$self.$set = $$props => {
    		if ("todos" in $$props) $$invalidate(0, todos = $$props.todos);
    	};

    	return [todos, deleteTodo_handler];
    }

    class List extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$1, create_fragment$2, safe_not_equal, { todos: 0 });
    	}
    }

    /* src/FAB.svelte generated by Svelte v3.23.2 */

    function create_fragment$3(ctx) {
    	let button;
    	let img;
    	let img_src_value;
    	let img_alt_value;
    	let button_transition;
    	let current;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			button = element("button");
    			img = element("img");
    			if (img.src !== (img_src_value = "icons/" + /*type*/ ctx[0] + ".svg")) attr(img, "src", img_src_value);
    			attr(img, "alt", img_alt_value = "" + (/*type*/ ctx[0] + "-icon"));
    			attr(img, "class", "svelte-e0n6x0");
    			attr(button, "class", "svelte-e0n6x0");
    		},
    		m(target, anchor) {
    			insert(target, button, anchor);
    			append(button, img);
    			current = true;

    			if (!mounted) {
    				dispose = listen(button, "click", /*click_handler*/ ctx[1]);
    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (!current || dirty & /*type*/ 1 && img.src !== (img_src_value = "icons/" + /*type*/ ctx[0] + ".svg")) {
    				attr(img, "src", img_src_value);
    			}

    			if (!current || dirty & /*type*/ 1 && img_alt_value !== (img_alt_value = "" + (/*type*/ ctx[0] + "-icon"))) {
    				attr(img, "alt", img_alt_value);
    			}
    		},
    		i(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!button_transition) button_transition = create_bidirectional_transition(button, scale, {}, true);
    				button_transition.run(1);
    			});

    			current = true;
    		},
    		o(local) {
    			if (!button_transition) button_transition = create_bidirectional_transition(button, scale, {}, false);
    			button_transition.run(0);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(button);
    			if (detaching && button_transition) button_transition.end();
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let { type = "add" } = $$props;

    	function click_handler(event) {
    		bubble($$self, event);
    	}

    	$$self.$set = $$props => {
    		if ("type" in $$props) $$invalidate(0, type = $$props.type);
    	};

    	return [type, click_handler];
    }

    class FAB extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$2, create_fragment$3, safe_not_equal, { type: 0 });
    	}
    }

    /* src/Modal.svelte generated by Svelte v3.23.2 */

    function create_fragment$4(ctx) {
    	let section;
    	let div;
    	let section_transition;
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[1].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[0], null);

    	return {
    		c() {
    			section = element("section");
    			div = element("div");
    			if (default_slot) default_slot.c();
    			attr(div, "class", "content svelte-1vfmurq");
    			attr(section, "class", "wrapper svelte-1vfmurq");
    		},
    		m(target, anchor) {
    			insert(target, section, anchor);
    			append(section, div);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 1) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[0], dirty, null, null);
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);

    			add_render_callback(() => {
    				if (!section_transition) section_transition = create_bidirectional_transition(section, slide, { duration: 500 }, true);
    				section_transition.run(1);
    			});

    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			if (!section_transition) section_transition = create_bidirectional_transition(section, slide, { duration: 500 }, false);
    			section_transition.run(0);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(section);
    			if (default_slot) default_slot.d(detaching);
    			if (detaching && section_transition) section_transition.end();
    		}
    	};
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$set = $$props => {
    		if ("$$scope" in $$props) $$invalidate(0, $$scope = $$props.$$scope);
    	};

    	return [$$scope, $$slots];
    }

    class Modal extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$3, create_fragment$4, safe_not_equal, {});
    	}
    }

    /* src/ModalApp.svelte generated by Svelte v3.23.2 */

    function create_default_slot(ctx) {
    	let form;
    	let input;
    	let t;
    	let textarea;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			form = element("form");
    			input = element("input");
    			t = space();
    			textarea = element("textarea");
    			attr(input, "type", "text");
    			attr(input, "placeholder", "Judul");
    			input.autofocus = true;
    			attr(input, "class", "svelte-gsrrrk");
    			attr(textarea, "placeholder", "Deskripsi");
    			attr(textarea, "class", "svelte-gsrrrk");
    			attr(form, "class", "add-wrapper svelte-gsrrrk");
    		},
    		m(target, anchor) {
    			insert(target, form, anchor);
    			append(form, input);
    			set_input_value(input, /*title*/ ctx[0]);
    			append(form, t);
    			append(form, textarea);
    			set_input_value(textarea, /*desc*/ ctx[1]);
    			input.focus();

    			if (!mounted) {
    				dispose = [
    					listen(input, "input", /*input_input_handler*/ ctx[3]),
    					listen(textarea, "input", /*textarea_input_handler*/ ctx[4]),
    					listen(form, "submit", prevent_default(/*onAddTodo*/ ctx[2]))
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (dirty & /*title*/ 1 && input.value !== /*title*/ ctx[0]) {
    				set_input_value(input, /*title*/ ctx[0]);
    			}

    			if (dirty & /*desc*/ 2) {
    				set_input_value(textarea, /*desc*/ ctx[1]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(form);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function create_fragment$5(ctx) {
    	let modal;
    	let t;
    	let fab;
    	let current;

    	modal = new Modal({
    			props: {
    				$$slots: { default: [create_default_slot] },
    				$$scope: { ctx }
    			}
    		});

    	fab = new FAB({ props: { type: "send" } });
    	fab.$on("click", /*onAddTodo*/ ctx[2]);

    	return {
    		c() {
    			create_component(modal.$$.fragment);
    			t = space();
    			create_component(fab.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(modal, target, anchor);
    			insert(target, t, anchor);
    			mount_component(fab, target, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const modal_changes = {};

    			if (dirty & /*$$scope, desc, title*/ 67) {
    				modal_changes.$$scope = { dirty, ctx };
    			}

    			modal.$set(modal_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(modal.$$.fragment, local);
    			transition_in(fab.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(modal.$$.fragment, local);
    			transition_out(fab.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(modal, detaching);
    			if (detaching) detach(t);
    			destroy_component(fab, detaching);
    		}
    	};
    }

    function instance$4($$self, $$props, $$invalidate) {
    	const dispatch = createEventDispatcher();
    	let title = "";
    	let desc = "";

    	function onAddTodo() {
    		dispatch("addTodo", {
    			id: Math.floor(Math.random() * 1000000),
    			title,
    			desc
    		});
    	}

    	function input_input_handler() {
    		title = this.value;
    		$$invalidate(0, title);
    	}

    	function textarea_input_handler() {
    		desc = this.value;
    		$$invalidate(1, desc);
    	}

    	return [title, desc, onAddTodo, input_input_handler, textarea_input_handler];
    }

    class ModalApp extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$4, create_fragment$5, safe_not_equal, {});
    	}
    }

    /* src/App.svelte generated by Svelte v3.23.2 */

    function create_if_block$1(ctx) {
    	let modalapp;
    	let current;
    	modalapp = new ModalApp({});
    	modalapp.$on("addTodo", /*onAddTodo*/ ctx[3]);

    	return {
    		c() {
    			create_component(modalapp.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(modalapp, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i(local) {
    			if (current) return;
    			transition_in(modalapp.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(modalapp.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(modalapp, detaching);
    		}
    	};
    }

    function create_fragment$6(ctx) {
    	let header;
    	let t0;
    	let main;
    	let list;
    	let t1;
    	let fab;
    	let t2;
    	let if_block_anchor;
    	let current;
    	header = new Header({});
    	list = new List({ props: { todos: /*todos*/ ctx[1] } });
    	list.$on("deleteTodo", /*onDeleteTodo*/ ctx[4]);
    	fab = new FAB({});
    	fab.$on("click", /*toggleModal*/ ctx[2]);
    	let if_block = /*isModalOpen*/ ctx[0] && create_if_block$1(ctx);

    	return {
    		c() {
    			create_component(header.$$.fragment);
    			t0 = space();
    			main = element("main");
    			create_component(list.$$.fragment);
    			t1 = space();
    			create_component(fab.$$.fragment);
    			t2 = space();
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    			attr(main, "class", "svelte-7wrjuj");
    		},
    		m(target, anchor) {
    			mount_component(header, target, anchor);
    			insert(target, t0, anchor);
    			insert(target, main, anchor);
    			mount_component(list, main, null);
    			insert(target, t1, anchor);
    			mount_component(fab, target, anchor);
    			insert(target, t2, anchor);
    			if (if_block) if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const list_changes = {};
    			if (dirty & /*todos*/ 2) list_changes.todos = /*todos*/ ctx[1];
    			list.$set(list_changes);

    			if (/*isModalOpen*/ ctx[0]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*isModalOpen*/ 1) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block$1(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(header.$$.fragment, local);
    			transition_in(list.$$.fragment, local);
    			transition_in(fab.$$.fragment, local);
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(header.$$.fragment, local);
    			transition_out(list.$$.fragment, local);
    			transition_out(fab.$$.fragment, local);
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(header, detaching);
    			if (detaching) detach(t0);
    			if (detaching) detach(main);
    			destroy_component(list);
    			if (detaching) detach(t1);
    			destroy_component(fab, detaching);
    			if (detaching) detach(t2);
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function instance$5($$self, $$props, $$invalidate) {
    	let isModalOpen = false;
    	let todos = [];

    	function toggleModal() {
    		$$invalidate(0, isModalOpen = !isModalOpen);
    	}

    	function onAddTodo(e) {
    		$$invalidate(1, todos = [...todos, e.detail]);
    		$$invalidate(0, isModalOpen = !isModalOpen);
    	}

    	function onDeleteTodo(e) {
    		$$invalidate(1, todos = todos.filter(({ id }) => id != e.detail));
    	}

    	return [isModalOpen, todos, toggleModal, onAddTodo, onDeleteTodo];
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$5, create_fragment$6, safe_not_equal, {});
    	}
    }

    const app = new App({
    	target: document.body,
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
