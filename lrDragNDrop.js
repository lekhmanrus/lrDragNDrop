(function (ng) {
    'use strict';

    function isJqueryEventDataTransfer(){
        return window.jQuery && (-1 == window.jQuery.event.props.indexOf('dataTransfer'));
    }

    if (isJqueryEventDataTransfer()) {
        window.jQuery.event.props.push('dataTransfer');
    }

    var module = ng.module('lrDragNDrop', []);

    module.service('lrDragStore', ['$document', function (document) {

        var store = {};

        this.hold = function hold(key, item, collectionFrom, safe) {
            store[key] = {
                item: item,
                collection: collectionFrom,
                safe: safe === true
            }
        };

        this.get = function (namespace) {
            var
                modelItem = store[namespace], itemIndex;

            if (modelItem) {
                itemIndex = modelItem.collection.indexOf(modelItem.item);
                return modelItem.safe === true ? ng.copy(modelItem.item) : modelItem.collection.splice(itemIndex, 1)[0];
            } else {
                return null;
            }
        };

        this.clean = function clean() {
            store = {};
        };

        this.isHolding = function (namespace) {
            return store[namespace] !== undefined;
        };

        document.bind('dragend', this.clean);
    }]);

    module.service('lrDragHelper', function () {
        var th = this;

        th.parseRepeater = function(scope, attr) {
            var
                repeatExpression = attr.ngRepeat,
                match;

            if (!repeatExpression) {
                throw Error('this directive must be used with ngRepeat directive');
            }
            match = repeatExpression.match(/^(.*\sin).(\S*)/);
            if (!match) {
                throw Error("Expected ngRepeat in form of '_item_ in _collection_' but got '" +
                    repeatExpression + "'.");
            }

            return scope.$eval(match[2]);
        };

        th.lrDragSrcDirective = function(store, safe) {
            return function compileFunc(el, iattr) {
                //iattr.$set('draggable', true);
                return function linkFunc(scope, element, attr) {
                    var
                        collection,
                        key = (safe === true ? attr.lrDragSrcSafe : attr.lrDragSrc ) || 'temp';

                    if(attr.lrDragData) {
                        scope.$watch(attr.lrDragData, function (newValue) {
                            collection = newValue;
                        });
                    } else {
                        collection = th.parseRepeater(scope, attr);
                    }

                    element.bind('dragstart', function (evt) {
                        if(scope[attr.lrDragStart]) {
                            scope[attr.lrDragStart](collection[scope.$index], element, evt);
                        }
                        store.hold(key, collection[scope.$index], collection, safe);
                        if(angular.isDefined(evt.dataTransfer)) {
                            evt.dataTransfer.setData('text/html', null); //FF/jQuery fix
                        }
                    });
                    element.bind('dragend', function (evt) {
                        if(scope[attr.lrDragEnd]) {
                            scope[attr.lrDragEnd](evt);
                        }
                    });
                }
            }
        }
    });

    module.directive('lrDragSrc', ['lrDragStore', 'lrDragHelper', function (store, dragHelper) {
        return{
            compile: dragHelper.lrDragSrcDirective(store)
        };
    }]);

    module.directive('lrDragSrcSafe', ['lrDragStore', 'lrDragHelper', function (store, dragHelper) {
        return{
            compile: dragHelper.lrDragSrcDirective(store, true)
        };
    }]);

    module.directive('lrDropTarget', ['lrDragStore', 'lrDragHelper', '$parse', function (store, dragHelper, $parse) {
        return {
            link: function (scope, element, attr) {

                var
                    collection,
                    key = attr.lrDropTarget || 'temp',
                    classCache = null;

                function isAfter(x, y) {
                    //check if below or over the diagonal of the box element
                    return (y - element[0].offsetTop) - (element[0].offsetHeight / 2);
                }

                function resetStyle() {
                    if (classCache !== null) {
                        element.removeClass(classCache);
                        classCache = null;
                    }
                }

                if(attr.lrDragData) {
                    scope.$watch(attr.lrDragData, function (newValue) {
                        collection = newValue;
                    });
                } else {
                    collection = dragHelper.parseRepeater(scope, attr);
                }

                element.bind('drop', function (evt) {
                    var
                        collectionCopy = ng.copy(collection),
                        item = store.get(key),
                        dropIndex, i, l;
                    if (item !== null) {
                        dropIndex = scope.$index;
                        dropIndex = isAfter((evt.offsetX != null) ? evt.offsetX : evt.originalEvent.layerX, (evt.offsetY != null) ? evt.offsetY : evt.originalEvent.layerY) > 0 ? dropIndex + 1 : dropIndex;
                        //srcCollection=targetCollection => we may need to apply a correction
                        if (collectionCopy.length > collection.length) {
                            for (i = 0, l = Math.min(dropIndex, collection.length - 1); i <= l; i++) {
                                if (!ng.equals(collectionCopy[i], collection[i])) {
                                    dropIndex = dropIndex - 1;
                                    break;
                                }
                            }
                        }
                        scope.$apply(function () {
                            collection.splice(dropIndex, 0, item);
                            var fn = $parse(attr.lrDropSuccess) || ng.noop;
                            fn(scope, {e: evt, item: item, collection: collection});
                        });
                        evt.preventDefault();
                        resetStyle();
                        store.clean();
                    }
                    if(scope[attr.lrOnDrop]) {
                        scope[attr.lrOnDrop](dropIndex, evt);
                    }
                });

                element.bind('dragleave', function(evt) {
                    resetStyle();
                    if(scope[attr.lrDragLeave]) {
                        scope[attr.lrDragLeave](evt);
                    }
                });

                element.bind('dragover', function (evt) {
                    var className;
                    if (store.isHolding(key)) {
                        className = isAfter((evt.offsetX != null) ? evt.offsetX : evt.originalEvent.layerX, (evt.offsetY != null) ? evt.offsetY : evt.originalEvent.layerY) > 0 ? 'lr-drop-target-after' : 'lr-drop-target-before';
                        if (classCache !== className && classCache !== null) {
                            element.removeClass(classCache);
                        }
                        if (classCache !== className) {
                            element.addClass(className);
                        }
                        classCache = className;
                    }
                    if(scope[attr.lrDragOver]) {
                        scope[attr.lrDragOver](evt);
                    }
                    evt.preventDefault();
                });
            }
        };
    }]);

    module.directive('lrDrop', ['lrDragStore', 'lrDragHelper', '$parse', function (store, dragHelper, $parse) {
        return {
            link: function (scope, element, attr) {

                var collection = scope[attr.lrCollection],
                    key = attr.lrDrop || 'temp',
                    classCache = null;

                var isAfter = function(x, y) {
                    //check if below or over the diagonal of the box element
                    return (y - element[0].offsetTop) - (element[0].offsetHeight / 2);
                };

                var resetStyle = function() {
                if(classCache !== null) {
                    element.removeClass(classCache);
                    classCache = null;
                  }
                };

                element.bind('drop', function (evt) {
                    var collectionCopy = angular.copy(collection),
                        item = store.get(key),
                        dropIndex, i, l;
                    if(item !== null) {
                        dropIndex = 0;
                        if(attr.index) {
                            dropIndex = attr.index;
                        }
                        //srcCollection=targetCollection => we may need to apply a correction
                        if(collectionCopy.length > collection.length) {
                            for(i = 0, l = Math.min(dropIndex, collection.length - 1); i <= l; i++) {
                                if(!angular.equals(collectionCopy[i], collection[i])) {
                                    dropIndex = dropIndex - 1;
                                    break;
                                }
                            }
                        }
                        scope.$apply(function() {
                            collection.splice(dropIndex, 0, item);
                            var fn = $parse(attr.lrDropSuccess) || angular.noop;
                            fn(scope, {e: evt, item: item, collection: collection});
                        });
                        evt.preventDefault();
                        resetStyle();
                        store.clean();
                    }
                    if(scope[attr.lrOnDrop]) {
                        scope[attr.lrOnDrop](dropIndex, evt);
                    }
                });

                element.bind('dragleave', function(evt) {
                    resetStyle();
                    if(scope[attr.lrDragLeave]) {
                        scope[attr.lrDragLeave](evt);
                    }
                });

                element.bind('dragover', function (evt) {
                    var className;
                    if(store.isHolding(key)) {
                        className = isAfter((evt.offsetX != null) ? evt.offsetX : evt.originalEvent.layerX, (evt.offsetY != null) ? evt.offsetY : evt.originalEvent.layerY) > 0 ? 'lr-drop-target-after' : 'lr-drop-target-before';
                        if(classCache !== className && classCache !== null) {
                            element.removeClass(classCache);
                        }
                        if(classCache !== className) {
                            element.addClass(className);
                        }
                        classCache = className;
                    }
                    if(scope[attr.lrDragOver]) {
                        scope[attr.lrDragOver](evt);
                    }
                    evt.preventDefault();
                });
            }
        };
    }]);
})(angular);