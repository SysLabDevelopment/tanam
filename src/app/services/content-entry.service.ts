import * as firebase from 'firebase/app';
import { Injectable } from '@angular/core';
import { AngularFirestore, CollectionReference, QueryDocumentSnapshot, AngularFirestoreDocument } from '@angular/fire/firestore';
import { map } from 'rxjs/operators';
import { FirebaseApp } from '@angular/fire';
import { ContentType } from './content-type.service';

export type ContentEntryStatus = 'published' | 'unpublished' | 'deleted';

export interface ContentEntry {
  id?: string; // Document id
  contentType: string;
  title: string; // Presentation title for *internal use only* (such as content listing etc)
  url: {
    root: string, // The entry path root
    path: string, // The entry URL
  };
  revision: number; // Constantly increasing
  status: ContentEntryStatus;
  tags: string[];
  publishTime?: Date | firebase.firestore.FieldValue;
  updatedAt: Date | firebase.firestore.FieldValue;
  createdAt: Date | firebase.firestore.FieldValue;
  data: { [key: string]: any }; // The actual content of the document
}

export interface ContentTypeQueryOptions {
  limit?: number;
  orderBy?: {
    field: string,
    sortOrder: 'asc' | 'desc',
  };
}

@Injectable({
  providedIn: 'root'
})
export class ContentEntryService {

  constructor(
    private readonly fbApp: FirebaseApp,
    private readonly firestore: AngularFirestore,
  ) { }

  async createContentEntry(contentType: ContentType) {
    const entryId = this.firestore.createId();
    const docRef = this.firestore.collection<ContentEntry>('tanam-content-entries').doc(entryId);

    await docRef.set({
      id: entryId,
      contentType: contentType.id,
      title: entryId,
      url: {
        root: contentType.slug,
        path: entryId,
      },
      revision: 0,
      status: 'unpublished',
      data: {},
      tags: [],
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    } as ContentEntry);

    return docRef;
  }

  saveContentEntry(entry: ContentEntry) {
    const docRef = this.firestore.collection<ContentEntry>('tanam-content-entries').doc(entry.id);
    entry.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

    return this.fbApp.firestore().runTransaction<void>(async (trx) => {
      const trxDoc = await trx.get(docRef.ref);
      const trxEntry = trxDoc.data() as ContentEntry;

      entry.revision = trxEntry.revision + 1;

      trx.update(docRef.ref, entry);
    });
  }

  findContentEntryByUrl(root: string, path: string) {
    console.log(`[ContentEntryService:findContentEntryByUrl] ${JSON.stringify({ root, path })}`);

    const queryFn = (ref: CollectionReference) =>
      ref.where('url.root', '==', root).where('url.path', '==', path).limit(1);

    return this.firestore
      .collection<ContentEntry>('tanam-content-entries', queryFn)
      .valueChanges()
      .pipe(map(entry => entry[0]));
  }

  getContentEntry(contentTypeId: string, entryId: string) {
    return this.firestore
      .collection('tanam-content-entries').doc<ContentEntry>(entryId)
      .snapshotChanges()
      .pipe(map(action => {
        return this.mergeDataWithId(action.payload);
      }));
  }

  getContentTypeEntries(contentTypeId: string, queryOpts?: ContentTypeQueryOptions) {
    console.log(`[ContentEntryService:getContentTypeFields] ${contentTypeId}: ${JSON.stringify(queryOpts)}`);

    const queryFn = (ref: CollectionReference) => {
      ref.where('contentType', '==', contentTypeId);

      if (queryOpts.orderBy) {
        ref.orderBy(queryOpts.orderBy.field, queryOpts.orderBy.sortOrder);
      }

      if (queryOpts.limit) {
        ref.limit(queryOpts.limit);
      }

      return ref;
    };

    return this.firestore
      .collection<ContentEntry>('tanam-content-entries', queryFn)
      .snapshotChanges()
      .pipe(map(actions => {
        return actions.map(action => {
          return this.mergeDataWithId(action.payload.doc);
        });
      }));
  }

  private mergeDataWithId(doc: QueryDocumentSnapshot<any>) {
    const data = doc.data();
    const id = doc.id;
    return { id, ...data } as ContentEntry;
  }
}